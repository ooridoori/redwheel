import { describe, expect, it } from 'vitest'
import { loadPlanningInputs } from '../load-inputs'
import { runAllocation } from './index'
import { derivationOf, backlogFirstWinnerSku } from './derivation'
import { coverGloss, projectedCoverCopy, skuStatus, weekTargetSummary } from './status'
import { percent, weeksPhrase } from '../format'
import { scopeKpis } from './scope'
import { insightsFor } from './insights'
import {
  aggregateCoverSummary,
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
    expect(row.forecast).toBe(29)
    expect(row.targetWeeks).toBe(8)
    expect(row.targetInventory).toBe(232)
    expect(row.desiredBuild).toBe(200)
    expect(row.build).toBe(0)
    expect(row.endingInventory).toBe(32)
    expect(row.startingCoverage).toBeCloseTo(2.1, 2)
    expect(row.endingCoverage).toBeCloseTo(1.1, 2)
    expect(sibling.startingCoverage).toBeCloseTo(0.18, 2)
    expect(lineWeek.capacity).toBe(150)
    expect(lineWeek.desiredBuild).toBe(638)
    expect(lineWeek.unmet).toBe(488)
  })

  it('labels the required-build expansion from those same fields', () => {
    const byLabel = Object.fromEntries(derivation.need.map((term) => [term.label, term.value]))
    expect(byLabel['Target inventory']).toBe(232)
    expect(byLabel.Backlog).toBe(189)
    expect(byLabel['Current plant demand']).toBe(29)
    expect(byLabel['Starting inventory']).toBe(250)
    expect(byLabel['Required build']).toBe(200)
    expect(byLabel['Current plant demand']).toBe(row.forecast)
    expect(derivation.need.find((term) => term.label === 'Current plant demand')?.note).toMatch(
      /Dealer-held inventory is not subtracted/,
    )
  })

  it('labels the line constraint from the line-week, not a SKU-local guess', () => {
    const byLabel = Object.fromEntries(derivation.capacity.map((term) => [term.label, term.value]))
    expect(byLabel['This SKU needs']).toBe(200)
    expect(byLabel['Other SKU need']).toBe(438)
    expect(byLabel['Total required build']).toBe(638)
    expect(byLabel['Available line capacity']).toBe(150)
    expect(byLabel['Unmet need']).toBe(488)
    expect(derivation.lineNeed.thisNeed + derivation.lineNeed.otherNeed).toBe(derivation.lineNeed.totalRequired)
    expect(derivation.lineNeed.totalRequired).toBe(lineWeek.desiredBuild)
    expect(derivation.lineNeed.unmet).toBe(lineWeek.unmet)
    expect(derivation.lineNeed.coverage).toBeCloseTo(150 / 638)
  })

  it('marks the miss as a capacity short, not an engine error', () => {
    const status = skuStatus(row)
    expect(status.met).toBe(false)
    expect(status.shorted).toBe(true)
    expect(status.label).toBe('6.9 weeks below target')
    expect(status.detail).toBe('Short due to line capacity')
    expect(weeksPhrase(row.endingCoverage)).toBe('1.10 weeks')
    expect(projectedCoverCopy(row)).toEqual({
      primary: '1.1w projected',
      secondary: '6.9w below 8w target',
    })
  })

  it('keeps a post-allocation gap secondary so it cannot be read as the ranking input', () => {
    const later = plan.rows.find((entry) => entry.sku === 'RW-4418' && entry.weekStart === '2026-09-14')!
    const copy = projectedCoverCopy(later)
    expect(copy.primary).toMatch(/projected$/)
    expect(copy.primary).not.toMatch(/below/)
    expect(copy.secondary).toMatch(/below \d+w target/)
  })

  it('names RW-9835 as the SKU that received capacity', () => {
    const winner = derivation.peers.find((peer) => peer.prioritized)!
    expect(winner.sku).toBe('RW-9835')
    expect(winner.build).toBe(150)
    expect(derivation.peers.find((peer) => peer.sku === 'RW-7298')?.prioritized).toBe(false)
    expect(winner.startingCoverage).toBeLessThan(
      derivation.peers.find((peer) => peer.sku === 'RW-7298')!.startingCoverage,
    )
    expect(winner.endingCoverage).toBeDefined()
  })

  it('names the largest-backlog SKU under owed-customers-first from engine backlog, not cover', () => {
    const next = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'backlog-first' })
    const mtbRows = next.rows.filter((entry) => entry.weekStart === week && entry.line === 'mtb-base')
    const mtbLine = next.lineWeeks.find((entry) => entry.weekStart === week && entry.line === 'mtb-base')!
    const owed = mtbRows.find((entry) => entry.sku === 'RW-9901')!
    const surplus = mtbRows.find((entry) => entry.sku === 'RW-9324')!
    const explained = derivationOf(owed, mtbLine, mtbRows, 'backlog-first')
    const winner = explained.peers.find((peer) => peer.prioritized)!

    expect(backlogFirstWinnerSku(mtbRows)).toBe('RW-9901')
    expect(winner.sku).toBe('RW-9901')
    expect(winner.startingBacklog).toBe(owed.startingBacklog)
    expect(winner.startingBacklog).toBeGreaterThan(surplus.startingBacklog)
    expect(winner.endingBacklog).toBe(owed.endingBacklog)
    expect(winner.build).toBe(owed.build)
    expect(explained.peers.find((peer) => peer.sku === 'RW-9324')?.prioritized).toBe(false)
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
    expect(surplus.forecast).toBe(11)
    expect(surplus.targetInventory).toBe(132)
    expect(surplus.targetWeeks).toBe(12)
    expect(surplus.endingInventory).toBe(1889)
    expect(surplus.startingCoverage).toBeCloseTo(100.77, 2)
    expect(surplus.endingCoverage).toBeCloseTo(99.77, 2)
    expect(surplus.shipped).toBe(11)
    expect(siblingLarge.startingCoverage).toBeCloseTo(-9.17, 2)
    expect(siblingLarge.desiredBuild).toBe(1305)
    expect(siblingLarge.build).toBe(130)
    expect(mtbLine.capacity).toBe(130)
    expect(mtbLine.unmet).toBe(1175)
  })

  it('labels other-SKU need rather than implying this SKU asked for 1,155', () => {
    const byLabel = Object.fromEntries(mtbDerivation.capacity.map((term) => [term.label, term.value]))
    expect(byLabel['This SKU needs']).toBe(0)
    expect(byLabel['Other SKU need']).toBe(1305)
    expect(byLabel['Total required build']).toBe(1305)
    expect(byLabel['Available line capacity']).toBe(130)
    expect(byLabel['Unmet need']).toBe(1175)
  })

  it('does not treat a zero-need SKU as having lost a competition', () => {
    expect(surplus.desiredBuild).toBe(0)
    expect(skuStatus(surplus).met).toBe(true)
    expect(skuStatus(surplus).detail).toBeNull()
    expect(coverGloss(surplus.startingCoverage, surplus.targetWeeks)).toContain('well above')
    const siblingPeer = mtbDerivation.peers.find((peer) => peer.sku === 'RW-9901')!
    expect(siblingPeer.desiredBuild).toBe(1305)
    expect(siblingPeer.build).toBe(130)
  })
})

describe('line-need math exposes the total-required denominator', () => {
  it('adds this SKU and other SKUs to the line-week required build', () => {
    const carbonWeek = plan.lineWeeks.find((entry) => entry.weekStart === week && entry.line === 'mtb-carbon')!
    const small = plan.rows.find((entry) => entry.sku === 'RW-9304' && entry.weekStart === week)!
    const carbonRows = plan.rows.filter((entry) => entry.weekStart === week && entry.line === 'mtb-carbon')
    const carbon = derivationOf(small, carbonWeek, carbonRows)

    expect(carbon.lineNeed.thisNeed).toBe(small.desiredBuild)
    expect(carbon.lineNeed.thisNeed + carbon.lineNeed.otherNeed).toBe(carbon.lineNeed.totalRequired)
    expect(carbon.lineNeed.totalRequired).toBe(carbonWeek.desiredBuild)
    expect(carbon.lineNeed.capacity).toBe(carbonWeek.capacity)
    expect(carbon.lineNeed.unmet).toBe(carbonWeek.unmet)
    expect(carbon.lineNeed.unmet).toBe(carbon.lineNeed.totalRequired - carbon.lineNeed.capacity)
    expect(carbon.lineNeed.coverage).toBeCloseTo(carbonWeek.capacity / carbonWeek.desiredBuild)
    expect(percent(carbon.lineNeed.coverage, 2)).toBe(
      percent(carbonWeek.capacity / carbonWeek.desiredBuild, 2),
    )
    expect(carbon.lineNeed.totalRequired).toBe(carbonRows.reduce((sum, row) => sum + row.desiredBuild, 0))
  })

  it('keeps proportional whole-unit shares summing to line capacity', () => {
    const next = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'proportional' })
    const carbonWeek = next.lineWeeks.find((entry) => entry.weekStart === week && entry.line === 'mtb-carbon')!
    const carbonRows = next.rows.filter((entry) => entry.weekStart === week && entry.line === 'mtb-carbon')
    const needing = carbonRows.filter((row) => row.desiredBuild > 0)

    expect(needing.reduce((sum, row) => sum + row.build, 0)).toBe(carbonWeek.capacity)
    expect(carbonWeek.build).toBe(carbonWeek.capacity)
  })
})

describe('horizon KPIs distinguish line cover from SKU-weeks', () => {
  it('counts 4/4 lines at target and 334 SKU-week misses due to capacity', () => {
    const kpis = scopeKpis(plan, 'all')
    expect(kpis.linesAtTarget).toBe(4)
    expect(kpis.linesInScope).toBe(4)
    expect(kpis.skuWeeks).toBe(1210)
    expect(kpis.skuWeeksAtTarget).toBe(876)
    expect(kpis.skuWeeksMissedToCapacity).toBe(334)
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

  it('summarises the default brief scenario', () => {
    expect(scenarioSummary(DEFAULT_POLICY)).toBe('Worst-off first · Brief cover targets')
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
        expect(blob).toMatch(/before this week's production is allocated/)
      } else {
        expect(blob).not.toMatch(/furthest below/)
      }
    }
  })

  it.each(rules)('What to watch stays policy-neutral for %s', (rationing) => {
    const next = runAllocation(inputs, { ...DEFAULT_POLICY, rationing })
    const watch = insightsFor(next, 'all')
    expect(watch[0]?.category).toBe('Plan health')
    expect(watch.map((item) => item.category)).toContain('SKU mix risk')
    expect(watch.map((item) => item.category)).toContain('Capacity pressure')
    const body = watch.map((item) => item.body).join(' ')
    expect(body).not.toMatch(/furthest below/)
    expect(body).not.toMatch(/Worst-off first/)
    expect(body).not.toMatch(/Mountain — Carbon looks on track/)
  })
})

describe('aggregate line-cover chart reads engine line weeks', () => {
  it('annotates recoveries from firstWeekAtTarget, not from SKU rows', () => {
    const events = recoveryEvents(plan, ['road-base', 'road-carbon', 'mtb-base', 'mtb-carbon'])
    expect(events.map((event) => event.line)).toEqual(['road-base', 'road-carbon', 'mtb-carbon'])
    expect(events.find((event) => event.line === 'mtb-base')).toBeUndefined()

    const carbon = events.find((event) => event.line === 'mtb-carbon')!
    expect(carbon.week).toBe(plan.kpis.lines.find((line) => line.line === 'mtb-carbon')!.firstWeekAtTarget)
    expect(carbon.targetWeeks).toBe(15)
    expect(recoveryCaption(carbon)).toBe('Mountain — Carbon reaches 15w aggregate cover · Sep 2027')
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

  it('describes each aggregate-cover trajectory across the selected range', () => {
    const point = (weekStart: string, endingCoverage: number) => ({
      weekStart,
      endingCoverage,
      targetWeeks: 8,
    })

    expect(
      aggregateCoverSummary(
        'road-carbon',
        [point('2026-09-07', 4), point('2026-09-14', 7)],
        'selected range',
      )?.state,
    ).toBe('remains-below')
    expect(
      aggregateCoverSummary(
        'road-carbon',
        [point('2026-09-07', 4), point('2026-12-28', 8)],
        'selected range',
      )?.state,
    ).toBe('reaches-reference')
    expect(
      aggregateCoverSummary(
        'road-carbon',
        [point('2026-09-07', 9), point('2026-11-02', 7)],
        'selected range',
      )?.state,
    ).toBe('falls-below')
    expect(
      aggregateCoverSummary(
        'road-carbon',
        [point('2026-09-07', 8), point('2026-11-02', 10)],
        'selected range',
      )?.state,
    ).toBe('remains-at-or-above')
  })

  it('uses the selected Road — Carbon trajectory rather than its opening state', () => {
    const selectedWeeks = new Set(plan.weeks.slice(0, 26))
    const points = plan.lineWeeks.filter(
      (entry) => entry.line === 'road-carbon' && selectedWeeks.has(entry.weekStart),
    )
    const summary = aggregateCoverSummary('road-carbon', points, 'selected range')

    expect(summary?.summary).toBe('Aggregate cover reaches 8w')
    expect(summary?.detail).toBe('Road — Carbon reaches 8w aggregate cover in Dec 2026.')
  })
})

describe('What to watch is decision-support, not a line-level recap', () => {
  it('calls out Mountain — Base SKU mix while the line stays at target', () => {
    const watch = insightsFor(plan, 'mtb-base', plan.weeks.slice(0, 26))
    const byCategory = Object.fromEntries(watch.map((item) => [item.category, item]))

    expect(byCategory['Plan health']?.body).toMatch(/stays above its 12w target/)
    expect(byCategory['SKU mix risk']?.body).toMatch(/Aggregate line cover stays at\/above its reference/)
    expect(byCategory['SKU mix risk']?.body).toMatch(/below target/)
    expect(byCategory['SKU mix risk']?.action?.label).toBe('View affected SKU')
    expect(byCategory['SKU mix risk']?.action?.sku).toBeTruthy()
    expect(byCategory['Capacity pressure']?.body).toMatch(/peaks in/)
    expect(byCategory['Capacity pressure']?.action?.label).toBe('View peak constrained week')
    const constrainedRow = plan.rows.find(
      (row) =>
        row.sku === byCategory['Capacity pressure']?.action?.sku &&
        row.weekStart === byCategory['Capacity pressure']?.action?.weekStart,
    )
    expect(constrainedRow?.desiredBuild).toBeGreaterThan(constrainedRow?.build ?? 0)
    expect(byCategory['Recommended focus']?.body).toMatch(/rebalancing size mix/)
  })

  it('omits capacity pressure when there are no constrained rows to locate', () => {
    const unconstrained = {
      ...plan,
      rows: plan.rows.map((row) => ({ ...row, build: row.desiredBuild })),
    }

    expect(insightsFor(unconstrained, 'all').map((item) => item.category)).not.toContain(
      'Capacity pressure',
    )
  })
})
