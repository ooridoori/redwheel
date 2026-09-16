import { describe, expect, it } from 'vitest'
import { loadPlanningInputs } from '../load-inputs'
import { runAllocation } from './index'
import { derivationOf } from './derivation'
import { coverGloss, skuStatus, weekTargetSummary } from './status'
import { weeksPhrase } from '../format'
import { scopeKpis } from './scope'
import { chartReconcileCue, insightsFor } from './insights'
import {
  coverAxis,
  coverStatus,
  recoveryCaption,
  recoveryEvents,
} from './line-cover-view'
import {
  ALLOCATION_BADGE_LABELS,
  ALLOCATION_PEER_CAPTIONS,
  DEFAULT_POLICY,
  RATIONING_DESCRIPTIONS,
  scenarioSummary,
  type RationingRule,
} from './policy'
import {
  DEALER_TREATMENT_DESCRIPTIONS,
  type DealerStockTreatment,
} from './dealer-buffer'

const inputs = loadPlanningInputs()
const plan = runAllocation(inputs)
const week = '2026-09-07'
const row = plan.rows.find((entry) => entry.sku === 'RW-7298' && entry.weekStart === week)!
const sibling = plan.rows.find((entry) => entry.sku === 'RW-9835' && entry.weekStart === week)!
const lineWeek = plan.lineWeeks.find((entry) => entry.weekStart === week && entry.line === 'road-base')!
const lineRows = plan.rows.filter((entry) => entry.weekStart === week && entry.line === 'road-base')
const derivation = derivationOf(row, lineWeek, lineRows)

describe('RW-7298 week of 2026-09-07 — UI reads engine fields', () => {
  it('exposes the acceptance numbers from the plan row, not new math', () => {
    expect(row.startingInventory).toBe(250)
    expect(row.startingBacklog).toBe(189)
    expect(row.startingNet).toBe(61)
    expect(row.forecast).toBe(16)
    expect(row.grossForecast).toBe(29)
    expect(row.targetWeeks).toBe(8)
    expect(row.targetInventory).toBe(128)
    expect(row.desiredBuild).toBe(83)
    expect(row.build).toBe(0)
    expect(row.endingInventory).toBe(45)
    expect(row.startingCoverage).toBeCloseTo(3.81, 2)
    expect(row.endingCoverage).toBeCloseTo(2.81, 2)
    expect(sibling.startingCoverage).toBeCloseTo(0.32, 2)
    expect(lineWeek.capacity).toBe(150)
    expect(lineWeek.desiredBuild).toBe(326)
    expect(lineWeek.unmet).toBe(176)
  })

  it('labels the required-build expansion from those same fields', () => {
    const byLabel = Object.fromEntries(derivation.need.map((term) => [term.label, term.value]))
    expect(byLabel['Target inventory']).toBe(128)
    expect(byLabel.Backlog).toBe(189)
    expect(byLabel['Current plant demand']).toBe(16)
    expect(byLabel['Starting inventory']).toBe(250)
    expect(byLabel['Required build']).toBe(83)
    expect(byLabel['Current plant demand']).toBe(row.forecast)
  })

  it('labels the line constraint from the line-week, not a SKU-local guess', () => {
    const byLabel = Object.fromEntries(derivation.capacity.map((term) => [term.label, term.value]))
    expect(byLabel['This SKU needs']).toBe(83)
    expect(byLabel['Other SKU need']).toBe(243)
    expect(byLabel['Line capacity']).toBe(150)
    expect(byLabel['Unmet need']).toBe(176)
  })

  it('marks the miss as a capacity short, not an engine error', () => {
    const status = skuStatus(row)
    expect(status.met).toBe(false)
    expect(status.shorted).toBe(true)
    expect(status.label).toBe('5.2 weeks below target')
    expect(status.detail).toBe('Short due to line capacity')
    expect(weeksPhrase(row.endingCoverage)).toBe('2.81 weeks')
  })

  it('names RW-9835 as the SKU that received capacity', () => {
    const winner = derivation.peers.find((peer) => peer.prioritized)!
    expect(winner.sku).toBe('RW-9835')
    expect(winner.build).toBe(150)
    expect(derivation.peers.find((peer) => peer.sku === 'RW-7298')?.prioritized).toBe(false)
  })

  it('summarises the week from atTarget / shorted flags already on the rows', () => {
    const weekRows = plan.rows.filter((entry) => entry.weekStart === week)
    const summary = weekTargetSummary(weekRows)
    expect(summary.primary).toBe('1 of 10 SKUs meet target cover')
    expect(summary.secondary).toBe('9 remain below target due to capacity constraints')
  })
})

describe('RW-9324 week of 2026-09-07 — already above target', () => {
  const surplus = plan.rows.find((entry) => entry.sku === 'RW-9324' && entry.weekStart === week)!
  const siblingLarge = plan.rows.find((entry) => entry.sku === 'RW-9901' && entry.weekStart === week)!
  const mtbLine = plan.lineWeeks.find((entry) => entry.weekStart === week && entry.line === 'mtb-base')!
  const mtbRows = plan.rows.filter((entry) => entry.weekStart === week && entry.line === 'mtb-base')
  const mtbDerivation = derivationOf(surplus, mtbLine, mtbRows)

  it('reads the surplus SKU from the plan row', () => {
    expect(surplus.desiredBuild).toBe(0)
    expect(surplus.build).toBe(0)
    expect(surplus.startingInventory).toBe(1900)
    expect(surplus.startingBacklog).toBe(0)
    expect(surplus.forecast).toBe(6)
    expect(surplus.targetInventory).toBe(72)
    expect(surplus.targetWeeks).toBe(12)
    expect(surplus.endingInventory).toBe(1894)
    expect(surplus.startingCoverage).toBeCloseTo(130.46, 2)
    expect(surplus.endingCoverage).toBeCloseTo(129.46, 2)
    expect(surplus.shipped).toBe(6)
    expect(siblingLarge.startingCoverage).toBeCloseTo(-9.28, 2)
    expect(siblingLarge.desiredBuild).toBe(1155)
    expect(siblingLarge.build).toBe(130)
    expect(mtbLine.capacity).toBe(130)
    expect(mtbLine.unmet).toBe(1025)
  })

  it('labels other-SKU need rather than implying this SKU asked for 1,155', () => {
    const byLabel = Object.fromEntries(mtbDerivation.capacity.map((term) => [term.label, term.value]))
    expect(byLabel['This SKU needs']).toBe(0)
    expect(byLabel['Other SKU need']).toBe(1155)
    expect(byLabel['Line capacity']).toBe(130)
    expect(byLabel['Unmet need']).toBe(1025)
  })

  it('does not treat a zero-need SKU as having lost a competition', () => {
    expect(surplus.desiredBuild).toBe(0)
    expect(skuStatus(surplus).met).toBe(true)
    expect(skuStatus(surplus).detail).toBeNull()
    expect(coverGloss(surplus.startingCoverage, surplus.targetWeeks)).toContain('well above')
    const siblingPeer = mtbDerivation.peers.find((peer) => peer.sku === 'RW-9901')!
    expect(siblingPeer.desiredBuild).toBe(1155)
    expect(siblingPeer.build).toBe(130)
  })
})

describe('horizon KPIs distinguish line cover from SKU-weeks', () => {
  it('counts 4/4 lines at target and 296 SKU-week misses due to capacity', () => {
    const kpis = scopeKpis(plan, 'all')
    expect(kpis.linesAtTarget).toBe(4)
    expect(kpis.linesInScope).toBe(4)
    expect(kpis.skuWeeks).toBe(1210)
    expect(kpis.skuWeeksAtTarget).toBe(914)
    expect(kpis.skuWeeksMissedToCapacity).toBe(296)
  })

  it('scopes SKU-week attainment to the selected weeks without changing horizon line status', () => {
    const kpis = scopeKpis(plan, 'all', plan.weeks.slice(0, 26))
    expect(kpis.skuWeeks).toBe(260)
    expect(kpis.linesAtTarget).toBe(4)
    expect(kpis.tightestLine).toBeTruthy()
  })
})

describe('scenario copy follows the selected policy', () => {
  const rules: RationingRule[] = ['worst-first', 'proportional', 'backlog-first']
  const treatments: DealerStockTreatment[] = ['channel-segregated', 'exclude', 'central']

  it('summarises the default brief scenario', () => {
    expect(scenarioSummary(DEFAULT_POLICY)).toBe(
      'Worst-off first · Dealer stock serves dealer demand · Brief cover targets',
    )
  })

  it('labels edited cover targets as custom without changing other defaults', () => {
    const custom = {
      ...DEFAULT_POLICY,
      targets: {
        ...DEFAULT_POLICY.targets,
        'mtb-carbon': [{ from: '2026-01-01', weeks: 20 }],
      },
    }
    expect(scenarioSummary(custom)).toContain('Custom cover targets')
    expect(scenarioSummary(custom)).toContain('Worst-off first')
  })

  it('keeps furthest-below language only on worst-off first', () => {
    for (const rule of rules) {
      const blob = `${RATIONING_DESCRIPTIONS[rule]} ${ALLOCATION_BADGE_LABELS[rule]} ${ALLOCATION_PEER_CAPTIONS[rule]}`
      if (rule === 'worst-first') {
        expect(blob).toMatch(/furthest below/)
      } else {
        expect(blob).not.toMatch(/furthest below/)
      }
    }
  })

  it('describes exclude as ignoring supply, not dropping dealer-channel demand', () => {
    expect(DEALER_TREATMENT_DESCRIPTIONS.exclude).toMatch(/ignored as supply/)
    expect(DEALER_TREATMENT_DESCRIPTIONS.exclude).toMatch(/still reaches the plant/)
    expect(DEALER_TREATMENT_DESCRIPTIONS.exclude).not.toMatch(/excluded from both/)
  })

  it.each(rules.flatMap((rationing) => treatments.map((dealerStock) => ({ rationing, dealerStock }))))(
    'What to watch stays policy-neutral for $rationing / $dealerStock',
    ({ rationing, dealerStock }) => {
      const next = runAllocation(inputs, { ...DEFAULT_POLICY, rationing, dealerStock })
      const watch = insightsFor(next, 'all')
      expect(watch[0]?.category).toBe('Plan health')
      expect(watch.map((item) => item.category)).toContain('SKU mix risk')
      expect(watch.map((item) => item.category)).toContain('Capacity pressure')
      const body = watch.map((item) => item.body).join(' ')
      expect(body).not.toMatch(/furthest below/)
      expect(body).not.toMatch(/Worst-off first/)
      expect(body).not.toMatch(/Mountain — Carbon looks on track/)
    },
  )
})

describe('line-level cover chart reads engine line weeks', () => {
  it('annotates recoveries from firstWeekAtTarget, not from SKU rows', () => {
    const events = recoveryEvents(plan, ['road-base', 'road-carbon', 'mtb-base', 'mtb-carbon'])
    expect(events.map((event) => event.line)).toEqual(['road-base', 'road-carbon', 'mtb-carbon'])
    expect(events.find((event) => event.line === 'mtb-base')).toBeUndefined()

    const carbon = events.find((event) => event.line === 'mtb-carbon')!
    expect(carbon.week).toBe(plan.kpis.lines.find((line) => line.line === 'mtb-carbon')!.firstWeekAtTarget)
    expect(carbon.targetWeeks).toBe(15)
    expect(recoveryCaption(carbon)).toBe('Mountain — Carbon reaches 15w target · Aug 2027')
  })

  it('caps the axis when Mountain — Base would stretch the target zone', () => {
    const all = coverAxis(plan, ['road-base', 'road-carbon', 'mtb-base', 'mtb-carbon'])
    expect(all.capped).toBe(true)
    expect(all.max).toBeLessThanOrEqual(22)
    expect(all.overflow[0]?.line).toBe('mtb-base')
    expect(all.overflow[0]!.peak).toBeGreaterThan(all.max)

    const road = coverAxis(plan, ['road-carbon'])
    expect(road.capped).toBe(false)
    expect(road.min).toBeLessThan(0)
  })

  it('classifies cover against the week’s target from the line-week', () => {
    const opening = plan.lineWeeks.find((entry) => entry.line === 'mtb-carbon' && entry.weekStart === plan.weeks[0])!
    expect(coverStatus(opening.endingCoverage, opening.targetWeeks)).toBe('Below target')
    const recovered = plan.kpis.lines.find((line) => line.line === 'mtb-carbon')!
    const recoveredWeek = plan.lineWeeks.find(
      (entry) => entry.line === 'mtb-carbon' && entry.weekStart === recovered.firstWeekAtTarget,
    )!
    expect(coverStatus(recoveredWeek.endingCoverage, recoveredWeek.targetWeeks)).toBe('At target')
  })
})

describe('What to watch is decision-support, not a line-level recap', () => {
  it('calls out Mountain — Base SKU mix while the line stays at target', () => {
    const watch = insightsFor(plan, 'mtb-base', plan.weeks.slice(0, 26))
    const byCategory = Object.fromEntries(watch.map((item) => [item.category, item]))

    expect(byCategory['Plan health']?.body).toMatch(/stays above its 12w target/)
    expect(byCategory['SKU mix risk']?.body).toMatch(/Line-level cover is healthy/)
    expect(byCategory['SKU mix risk']?.body).toMatch(/below target/)
    expect(byCategory['SKU mix risk']?.action?.label).toBe('View affected SKU')
    expect(byCategory['SKU mix risk']?.action?.sku).toBeTruthy()
    expect(byCategory['Capacity pressure']?.body).toMatch(/selected range/)
    expect(byCategory['Recommended focus']?.body).toMatch(/rebalancing size mix/)
    expect(chartReconcileCue(plan, 'mtb-base')).toBe('Line healthy overall · SKU mix uneven')
  })
})
