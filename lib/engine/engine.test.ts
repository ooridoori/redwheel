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
  /** Flat weekly forecast for this SKU. */
  demand: number
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
  const openingStock: Record<string, number> = {}
  const dealerStock: Record<string, number> = {}
  const backlog: Record<string, number> = {}

  for (const spec of specs) {
    demand[spec.sku] = Object.fromEntries(allWeeks.map((week) => [week, spec.demand]))
    openingStock[spec.sku] = spec.onHand ?? 0
    dealerStock[spec.sku] = 0
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
    demandByChannel: { dtc: {}, dealer: {}, commercial: {} },
    capacity: {
      'road-base': { ...emptyByWeek },
      'road-carbon': { ...emptyByWeek },
      'mtb-base': { ...emptyByWeek },
      'mtb-carbon': { ...emptyByWeek },
      [line]: Object.fromEntries(planned.map((week) => [week, capacity])),
    },
    history: [],
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

  it('clears backlog before serving new demand', () => {
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

describe('dealer stock policy', () => {
  it('ignores dealer-held stock by default', () => {
    const inputs = makeInputs({ specs: [{ sku: 'A', size: 'M', demand: 10, onHand: 0 }], capacity: 10_000 })
    inputs.dealerStock.A = 500

    const excluded = runAllocation(inputs, policyWith({ includeDealerStock: false }))
    const included = runAllocation(inputs, policyWith({ includeDealerStock: true }))

    expect(excluded.rows[0].startingInventory).toBe(0)
    expect(included.rows[0].startingInventory).toBe(500)
    expect(included.rows[0].desiredBuild).toBeLessThan(excluded.rows[0].desiredBuild)
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
