import { describe, expect, it } from 'vitest'
import type { Product } from '../domain'
import { lineOf } from '../domain'
import type { PlanningInputs } from '../planning-inputs'
import { addWeeks } from '../normalize/dates'
import { runAllocation } from './index'
import { DEFAULT_POLICY, type Policy, type RationingRule } from './policy'

const START = '2026-09-07'

interface Spec {
  sku: string
  size: Product['size']
  onHand?: number
  backlog?: number
  /** Flat weekly forecast for this SKU, across all channels. */
  demand: number
  /** How much of `demand` is dealer-channel. Defaults to none. */
  dealerDemand?: number
  /** Units already sitting on dealer floors. */
  dealerOnHand?: number
}

/**
 * Builds a minimal `PlanningInputs` for one production line with flat demand
 * and flat capacity, so a test asserts one behaviour rather than the shape of
 * Redwheel's real data.
 */
function makeInputs(options: {
  specs: Spec[]
  capacity: number
  planWeeks?: number
  forecastWeeks?: number
  bikeClass?: Product['class']
  trim?: Product['trim']
}): PlanningInputs {
  const { specs, capacity, planWeeks = 12, forecastWeeks = 60 } = options
  const bikeClass = options.bikeClass ?? 'mtb'
  const trim = options.trim ?? 'carbon'
  const line = lineOf(bikeClass, trim)

  const allWeeks = Array.from({ length: forecastWeeks }, (_, index) => addWeeks(START, index))
  const planned = allWeeks.slice(0, planWeeks)

  const products: Product[] = specs.map((spec) => ({
    sku: spec.sku,
    class: bikeClass,
    trim,
    size: spec.size,
    line,
  }))

  const demand: PlanningInputs['demand'] = {}
  const dealerDemand: PlanningInputs['demand'] = {}
  const openingStock: Record<string, number> = {}
  const dealerStock: Record<string, number> = {}
  const backlog: Record<string, number> = {}

  for (const spec of specs) {
    demand[spec.sku] = Object.fromEntries(allWeeks.map((week) => [week, spec.demand]))
    dealerDemand[spec.sku] = Object.fromEntries(allWeeks.map((week) => [week, spec.dealerDemand ?? 0]))
    openingStock[spec.sku] = spec.onHand ?? 0
    dealerStock[spec.sku] = spec.dealerOnHand ?? 0
    backlog[spec.sku] = spec.backlog ?? 0
  }

  const emptyByWeek = Object.fromEntries(planned.map((week) => [week, 0]))

  return {
    asOf: START,
    planWeeks: planned,
    forecastWeeks: allWeeks,
    products,
    openingStock,
    dealerStock,
    backlog,
    backlogByChannel: { dtc: 0, dealer: 0, commercial: 0 },
    demand,
    demandByChannel: { dtc: {}, dealer: dealerDemand, commercial: {} },
    capacity: {
      'road-base': { ...emptyByWeek },
      'road-carbon': { ...emptyByWeek },
      'mtb-base': { ...emptyByWeek },
      'mtb-carbon': { ...emptyByWeek },
      [line]: Object.fromEntries(planned.map((week) => [week, capacity])),
    },
    history: [],
    sources: [],
    notes: [],
  }
}

function policyWith(overrides: Partial<Policy>): Policy {
  return { ...DEFAULT_POLICY, ...overrides }
}

/** mtb-carbon carries a 15-week target in the default policy. */
const TARGET_WEEKS = 15

describe('reaching the target', () => {
  it('builds nothing when the position already covers the target', () => {
    const inputs = makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 10 * (TARGET_WEEKS + 1) }],
      capacity: 1_000,
    })
    const plan = runAllocation(inputs)
    expect(plan.rows[0].desiredBuild).toBe(0)
    expect(plan.rows[0].build).toBe(0)
  })

  it('builds up to the target and then holds steady at it', () => {
    const inputs = makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 0 }],
      capacity: 1_000,
    })
    const plan = runAllocation(inputs)

    expect(plan.rows[0].endingCoverage).toBeCloseTo(TARGET_WEEKS, 6)

    // Once at target, each week builds only what that week consumed.
    for (const row of plan.rows.slice(1)) {
      expect(row.build).toBe(10)
      expect(row.endingCoverage).toBeCloseTo(TARGET_WEEKS, 6)
    }
  })

  it('nets backlog out of the position, so owed units must be rebuilt', () => {
    const withBacklog = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 100, backlog: 40 }], capacity: 10_000 }),
    )
    const withoutBacklog = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 100, backlog: 0 }], capacity: 10_000 }),
    )
    expect(withBacklog.rows[0].desiredBuild - withoutBacklog.rows[0].desiredBuild).toBe(40)
  })

  it('serves backlog and new demand from the same stock', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 0, backlog: 25 }], capacity: 10_000 }),
    )
    const first = plan.rows[0]
    expect(first.shipped).toBe(35)
    expect(first.endingBacklog).toBe(0)
  })

  it('applies the 2028 step-up in the road target', () => {
    const inputs = makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 10 }],
      capacity: 1_000,
      bikeClass: 'road',
      trim: 'carbon',
      planWeeks: 120,
      forecastWeeks: 200,
    })
    const plan = runAllocation(inputs)
    expect(plan.rows.find((row) => row.weekStart < '2028-01-01')!.targetWeeks).toBe(8)
    expect(plan.rows.find((row) => row.weekStart >= '2028-01-01')!.targetWeeks).toBe(10)
  })
})

describe('capacity constraints', () => {
  it('never builds more than the line can build in a week', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'A', size: 'S', demand: 50 },
          { sku: 'B', size: 'M', demand: 50 },
        ],
        capacity: 60,
      }),
    )
    for (const lineWeek of plan.lineWeeks.filter((entry) => entry.capacity > 0)) {
      expect(lineWeek.build).toBeLessThanOrEqual(lineWeek.capacity)
    }
  })

  it('records what it could not build', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 100 }], capacity: 10 }),
    )
    const first = plan.lineWeeks.find((entry) => entry.capacity > 0)!
    expect(first.build).toBe(10)
    expect(first.unmet).toBe(first.desiredBuild - 10)
    expect(first.utilization).toBe(1)
  })

  it('allocates whole bikes only', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'A', size: 'S', demand: 33 },
          { sku: 'B', size: 'M', demand: 33 },
          { sku: 'C', size: 'L', demand: 33 },
        ],
        capacity: 100,
      }),
      policyWith({ rationing: 'proportional' }),
    )
    for (const row of plan.rows) expect(Number.isInteger(row.build)).toBe(true)
  })
})

describe('who gets shorted', () => {
  /** One SKU comfortably above target, one deeply below, competing for too little capacity. */
  const contested = () =>
    makeInputs({
      specs: [
        { sku: 'RICH', size: 'M', demand: 10, onHand: 10 * (TARGET_WEEKS + 5) },
        { sku: 'POOR', size: 'L', demand: 10, onHand: 0, backlog: 200 },
      ],
      capacity: 50,
    })

  const buildsFor = (rule: RationingRule) => {
    const plan = runAllocation(contested(), policyWith({ rationing: rule }))
    const week = plan.weeks[0]
    const at = (sku: string) => plan.rows.find((row) => row.weekStart === week && row.sku === sku)!
    return { rich: at('RICH').build, poor: at('POOR').build }
  }

  it('worst-first gives everything to the SKU furthest below target', () => {
    const { rich, poor } = buildsFor('worst-first')
    expect(poor).toBe(50)
    expect(rich).toBe(0)
  })

  it('proportional splits between them instead of starving one', () => {
    const inputs = makeInputs({
      specs: [
        { sku: 'A', size: 'M', demand: 10, onHand: 0 },
        { sku: 'B', size: 'L', demand: 10, onHand: 0 },
      ],
      capacity: 50,
    })
    const plan = runAllocation(inputs, policyWith({ rationing: 'proportional' }))
    const week = plan.weeks[0]
    const builds = plan.rows.filter((row) => row.weekStart === week).map((row) => row.build)
    expect(builds).toEqual([25, 25])
  })

  it('backlog-first serves the SKU with the largest debt', () => {
    const { poor } = buildsFor('backlog-first')
    expect(poor).toBe(50)
  })

  it('hands out the whole week of capacity under every rule', () => {
    for (const rule of ['worst-first', 'proportional', 'backlog-first'] as const) {
      const { rich, poor } = buildsFor(rule)
      expect(rich + poor).toBe(50)
    }
  })
})

describe('carrying state forward', () => {
  it('opens each week with what the previous week left', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 40, backlog: 15 }], capacity: 30 }),
    )
    const rows = plan.rows.filter((row) => row.sku === 'A')
    for (const [index, row] of rows.slice(1).entries()) {
      expect(row.startingInventory).toBe(rows[index].endingInventory)
      expect(row.startingBacklog).toBe(rows[index].endingBacklog)
    }
  })

  it('conserves units: what we start with plus what we build equals what we ship plus what we keep', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 40, onHand: 10, backlog: 100 }], capacity: 25 }),
    )
    for (const row of plan.rows) {
      expect(row.startingInventory + row.build).toBe(row.shipped + row.endingInventory)
    }
  })

  it('never reports negative stock or negative backlog', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 90, onHand: 5, backlog: 500 }], capacity: 10 }),
    )
    for (const row of plan.rows) {
      expect(row.endingInventory).toBeGreaterThanOrEqual(0)
      expect(row.endingBacklog).toBeGreaterThanOrEqual(0)
    }
  })
})

/**
 * The roll-forward is the load-bearing arithmetic of the whole engine: a week
 * ends with stock plus what was built, less everything that shipped, and
 * anything it could not ship becomes next week's debt.
 *
 * The failure mode these tests exist to catch is a roll-forward that adds the
 * build onto opening stock without consuming demand. Such a bug inflates cover
 * every week, so the plan reports hitting target while the shelves are empty —
 * and it would still satisfy a naive stock-only conservation check.
 */
describe('the weekly roll-forward', () => {
  it('consumes demand rather than banking the build', () => {
    // Hand-checkable: 100 on hand, 50 built, 20 owed and 30 forecast.
    // Obligations of 50 are covered in full, so stock ends where it started.
    const plan = runAllocation(
      makeInputs({
        specs: [{ sku: 'A', size: 'M', demand: 30, onHand: 100, backlog: 20 }],
        capacity: 50,
        planWeeks: 1,
      }),
    )
    const [week] = plan.rows

    expect(week.build).toBe(50)
    expect(week.shipped).toBe(50)
    expect(week.endingInventory).toBe(100)
    expect(week.endingBacklog).toBe(0)
    // The bug being guarded against would report 150 here.
    expect(week.endingInventory).not.toBe(week.startingInventory + week.build)
  })

  it('turns demand it cannot serve into next week\u2019s backlog', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [{ sku: 'A', size: 'M', demand: 30, onHand: 0, backlog: 0 }],
        capacity: 10,
        planWeeks: 2,
      }),
    )
    const [first, second] = plan.rows

    expect(first.shipped).toBe(10)
    expect(first.endingInventory).toBe(0)
    expect(first.endingBacklog).toBe(20)
    expect(second.startingBacklog).toBe(20)
    // Second week owes the 20 carried over plus another 30 of fresh demand.
    expect(second.endingBacklog).toBe(40)
  })

  it('balances the demand side of every week, not just the stock side', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 40, onHand: 10, backlog: 100 }], capacity: 25 }),
    )
    for (const row of plan.rows) {
      expect(row.endingBacklog).toBe(row.startingBacklog + row.forecast - row.shipped)
    }
  })

  it('never ends a week holding stock while still owing units', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'A', size: 'M', demand: 40, onHand: 10, backlog: 100 },
          { sku: 'B', size: 'L', demand: 5, onHand: 400, backlog: 0 },
        ],
        capacity: 60,
      }),
    )
    for (const row of plan.rows) {
      expect(Math.min(row.endingInventory, row.endingBacklog)).toBe(0)
    }
  })

  it('ships no more than it physically has', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 90, onHand: 5, backlog: 500 }], capacity: 10 }),
    )
    for (const row of plan.rows) {
      expect(row.shipped).toBeLessThanOrEqual(row.startingInventory + row.build)
      expect(row.shipped).toBeLessThanOrEqual(row.startingBacklog + row.forecast)
    }
  })

  it('loses no demand across the whole horizon', () => {
    const inputs = makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 40, onHand: 10, backlog: 100 }],
      capacity: 25,
    })
    const plan = runAllocation(inputs)
    const rows = plan.rows.filter((row) => row.sku === 'A')

    const demanded = rows.reduce((total, row) => total + row.forecast, 0)
    const shipped = rows.reduce((total, row) => total + row.shipped, 0)

    // Everything ever owed is either delivered or still owed at the end.
    expect(rows[0].startingBacklog + demanded).toBe(shipped + rows[rows.length - 1].endingBacklog)
  })

  it('loses no units across the whole horizon', () => {
    const inputs = makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 40, onHand: 10, backlog: 100 }],
      capacity: 25,
    })
    const plan = runAllocation(inputs)
    const rows = plan.rows.filter((row) => row.sku === 'A')

    const built = rows.reduce((total, row) => total + row.build, 0)
    const shipped = rows.reduce((total, row) => total + row.shipped, 0)

    expect(rows[0].startingInventory + built).toBe(shipped + rows[rows.length - 1].endingInventory)
  })
})

describe('dealer stock', () => {
  /** Half of demand is dealer-channel, and dealers hold 4 weeks of it on their floors. */
  const withDealers = () =>
    makeInputs({
      specs: [{ sku: 'A', size: 'M', demand: 20, dealerDemand: 10, dealerOnHand: 40, onHand: 0 }],
      capacity: 10_000,
    })

  it('lets dealer floor stock serve dealer demand, reducing what the plant builds', () => {
    const plan = runAllocation(withDealers())
    const first = plan.rows[0]

    expect(first.grossForecast).toBe(20)
    expect(first.absorbedByDealers).toBe(10)
    expect(first.forecast).toBe(10)
  })

  it('never turns dealer stock into inventory Redwheel can allocate', () => {
    const plan = runAllocation(withDealers())
    expect(plan.rows[0].startingInventory).toBe(0)
  })

  it('runs the buffer dry and then sends all dealer demand to the plant', () => {
    const plan = runAllocation(withDealers())
    const rows = plan.rows.filter((row) => row.sku === 'A')

    // 40 units of floor stock cover 4 weeks of 10-unit dealer demand.
    expect(rows.slice(0, 4).map((row) => row.absorbedByDealers)).toEqual([10, 10, 10, 10])
    expect(rows[4].absorbedByDealers).toBe(0)
    expect(rows[4].forecast).toBe(20)

    const absorption = plan.dealerBuffer.absorption.find((entry) => entry.sku === 'A')!
    expect(absorption.unitsAbsorbed).toBe(40)
    expect(absorption.weeksCovered).toBe(4)
    expect(absorption.exhaustedWeek).toBe(addWeeks(START, 3))
  })

  it('absorbs no more than the dealer channel actually demands', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [{ sku: 'A', size: 'M', demand: 20, dealerDemand: 0, dealerOnHand: 500 }],
        capacity: 10_000,
      }),
    )
    expect(plan.dealerBuffer.totalAbsorbed).toBe(0)
    expect(plan.rows[0].forecast).toBe(20)
  })

  it('leaves backlog alone — owed units still have to be built', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [{ sku: 'A', size: 'M', demand: 20, dealerDemand: 10, dealerOnHand: 500, backlog: 60 }],
        capacity: 10_000,
      }),
    )
    expect(plan.rows[0].startingBacklog).toBe(60)
  })

  it('the two alternative treatments bracket the default', () => {
    const inputs = withDealers()
    const segregated = runAllocation(inputs, policyWith({ dealerStock: 'channel-segregated' }))
    const excluded = runAllocation(inputs, policyWith({ dealerStock: 'exclude' }))
    const central = runAllocation(inputs, policyWith({ dealerStock: 'central' }))

    // Ignoring the file makes the plant look busier; pooling makes it look richer.
    expect(excluded.rows[0].forecast).toBe(20)
    expect(excluded.rows[0].desiredBuild).toBeGreaterThan(segregated.rows[0].desiredBuild)
    expect(central.rows[0].startingInventory).toBe(40)
    expect(central.rows[0].desiredBuild).toBeLessThan(excluded.rows[0].desiredBuild)
  })
})

describe('forecast mix as tie-breaker', () => {
  it('serves the bigger share of the line when two SKUs are equally short', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'SMALL', size: 'S', demand: 10, onHand: 0 },
          { sku: 'BIG', size: 'M', demand: 40, onHand: 0 },
        ],
        capacity: 100,
      }),
    )
    const week = plan.weeks[0]
    const at = (sku: string) => plan.rows.find((row) => row.weekStart === week && row.sku === sku)!

    // Both open at zero cover, so forecast mix breaks the tie.
    expect(at('SMALL').startingCoverage).toBe(at('BIG').startingCoverage)
    expect(at('BIG').build).toBe(100)
    expect(at('SMALL').build).toBe(0)
  })

  it('still lets urgency beat forecast mix', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'SMALL', size: 'S', demand: 10, onHand: 0, backlog: 200 },
          { sku: 'BIG', size: 'M', demand: 40, onHand: 40 * (TARGET_WEEKS + 2) },
        ],
        capacity: 100,
      }),
    )
    const week = plan.weeks[0]
    const at = (sku: string) => plan.rows.find((row) => row.weekStart === week && row.sku === sku)!

    expect(at('SMALL').build).toBe(100)
    expect(at('BIG').build).toBe(0)
  })
})

describe('the plan as a whole', () => {
  it('reports one row per SKU per planned week', () => {
    const plan = runAllocation(
      makeInputs({
        specs: [
          { sku: 'A', size: 'S', demand: 10 },
          { sku: 'B', size: 'M', demand: 10 },
        ],
        capacity: 100,
        planWeeks: 8,
      }),
    )
    expect(plan.rows).toHaveLength(16)
    expect(plan.weeks).toHaveLength(8)
  })

  it('summarizes utilization across the horizon', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 100 }], capacity: 10, planWeeks: 5 }),
    )
    expect(plan.kpis.totalCapacity).toBe(50)
    expect(plan.kpis.totalBuild).toBe(50)
    expect(plan.kpis.utilization).toBe(1)
  })

  it('reports when backlog clears', () => {
    const plan = runAllocation(
      makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, backlog: 60 }], capacity: 40, planWeeks: 10 }),
    )
    expect(plan.kpis.backlogAtStart).toBe(60)
    expect(plan.kpis.backlogClearedWeek).not.toBeNull()
    expect(plan.kpis.backlogAtEnd).toBe(0)
  })

  it('is deterministic', () => {
    const inputs = makeInputs({
      specs: [
        { sku: 'A', size: 'S', demand: 30, backlog: 100 },
        { sku: 'B', size: 'M', demand: 20, onHand: 50 },
      ],
      capacity: 45,
    })
    expect(runAllocation(inputs)).toEqual(runAllocation(inputs))
  })
})
