/**
 * Decision-support readings of the plan on screen.
 *
 * Chart shows line-level trajectory. This panel says what that trajectory can
 * hide, and which SKU to look at. Every figure comes from engine line-weeks
 * and plan rows — nothing here recomputes cover.
 */
import { LINE_LABELS, type LineId } from '../domain'
import { units, weekLabelLong, weeks as formatWeeks } from '../format'
import type { BuildPlan, LineKpi, PlanRow } from './index'
import { targetWeeksFor } from './policy'
import type { Scope } from './scope'
import { monthYear } from './line-cover-view'

export type WatchCategory = 'Plan health' | 'SKU mix risk' | 'Capacity pressure' | 'Recommended focus'

export interface InsightAction {
  label: string
  sku: string
  weekStart: string
}

export interface Insight {
  category: WatchCategory
  body: string
  tone: 'neutral' | 'good' | 'watch'
  action?: InsightAction
}

export interface SkuMixFinding {
  line: LineId
  worst: PlanRow
  best: PlanRow
  /** True when aggregate cover finishes at/above its reference every week. */
  lineHealthy: boolean
}

export function insightsFor(plan: BuildPlan, scope: Scope, weeks?: string[]): Insight[] {
  const lines = scope === 'all' ? plan.kpis.lines : plan.kpis.lines.filter((line) => line.line === scope)
  if (lines.length === 0) return []

  const weekSet = weeks ? new Set(weeks) : null
  const rows = plan.rows.filter(
    (row) => (scope === 'all' || row.line === scope) && (!weekSet || weekSet.has(row.weekStart)),
  )
  const mix = skuMixFinding(plan, scope)

  return [
    planHealth(plan, lines),
    skuMixRisk(mix, lines.length === 1),
    capacityPressure(rows),
    recommendedFocus(mix, lines),
  ].filter((insight): insight is Insight => insight !== null)
}

export function skuMixFinding(plan: BuildPlan, scope: Scope): SkuMixFinding | null {
  const firstWeek = plan.weeks[0]
  const opening = plan.rows.filter(
    (row) => row.weekStart === firstWeek && (scope === 'all' || row.line === scope),
  )
  if (opening.length < 2) return null

  let widest: { spread: number; worst: PlanRow; best: PlanRow } | null = null
  for (const line of new Set(opening.map((row) => row.line))) {
    const onLine = [...opening.filter((row) => row.line === line)].sort(
      (a, b) => a.startingCoverage - b.startingCoverage,
    )
    if (onLine.length < 2) continue
    const worst = onLine[0]
    const best = onLine[onLine.length - 1]
    const spread = best.startingCoverage - worst.startingCoverage
    if (!widest || spread > widest.spread) widest = { spread, worst, best }
  }

  if (!widest || widest.spread < 1) return null

  const lineWeeks = plan.lineWeeks.filter((entry) => entry.line === widest.worst.line)
  return {
    line: widest.worst.line,
    worst: widest.worst,
    best: widest.best,
    lineHealthy: lineWeeks.length > 0 && lineWeeks.every((entry) => entry.atTarget),
  }
}

function planHealth(plan: BuildPlan, lines: LineKpi[]): Insight {
  if (lines.length === 1) {
    const line = lines[0]
    const lineWeeks = plan.lineWeeks.filter((entry) => entry.line === line.line)
    const openingTarget = targetWeeksFor(plan.policy, line.line, plan.weeks[0])
    const alwaysAtTarget = lineWeeks.every((entry) => entry.atTarget)
    const recovered = lineWeeks.find((entry) => entry.weekStart === line.firstWeekAtTarget)

    let body: string
    if (alwaysAtTarget) {
      body =
        openingTarget === line.targetWeeks
          ? `Line stays above its ${openingTarget}w target across the horizon.`
          : 'Line stays at or above its required cover across the horizon.'
    } else if (line.firstWeekAtTarget && recovered) {
      body = `Line recovers to its ${recovered.targetWeeks}w target by ${monthYear(line.firstWeekAtTarget)}.`
    } else {
      body = `Line does not reach its ${line.targetWeeks}w target in the horizon.`
    }

    return { category: 'Plan health', body, tone: alwaysAtTarget ? 'good' : 'watch' }
  }

  const allFinish = lines.every((line) => line.coverageAtEnd >= line.targetWeeks)
  const unfinished = lines.filter((line) => line.coverageAtEnd < line.targetWeeks)
  const lastToTarget = [...lines]
    .filter((line) => line.firstWeekAtTarget)
    .sort((a, b) => a.firstWeekAtTarget!.localeCompare(b.firstWeekAtTarget!))
    .at(-1)

  let body: string
  if (allFinish) {
    body = `All ${lines.length} lines finish the horizon at target.`
  } else if (lastToTarget?.firstWeekAtTarget) {
    body = `${LINE_LABELS[lastToTarget.line]} reaches target by ${weekLabelLong(lastToTarget.firstWeekAtTarget)}. Not all lines finish at target.`
  } else if (unfinished[0]) {
    body = `${LINE_LABELS[unfinished[0].line]} does not reach target in the horizon.`
  } else {
    body = 'Not all lines finish the horizon at target.'
  }

  return { category: 'Plan health', body, tone: allFinish ? 'good' : 'watch' }
}

function skuMixRisk(mix: SkuMixFinding | null, singleLine: boolean): Insight | null {
  if (!mix) return null

  const short = mix.worst
  const over = mix.best
  const gap = short.targetWeeks - short.startingCoverage
  const shortBit = `size ${short.size} starts ${formatWeeks(gap)} below target`
  const overBit = `size ${over.size} holds ${formatWeeks(over.startingCoverage)}`
  const lineBit = singleLine
    ? 'Aggregate line cover stays at/above its reference'
    : `${LINE_LABELS[mix.line]} aggregate cover stays at/above its reference`

  const body =
    mix.lineHealthy && short.startingCoverage < short.targetWeeks
      ? `${lineBit}, but ${shortBit} while ${overBit}.`
      : `Cover is uneven across sizes: ${shortBit} while ${overBit}.`

  return {
    category: 'SKU mix risk',
    tone: 'watch',
    body,
    action: {
      label: 'View affected SKU',
      sku: short.sku,
      weekStart: short.weekStart,
    },
  }
}

function capacityPressure(rows: PlanRow[]): Insight | null {
  const constrained = rows.filter((row) => row.desiredBuild > row.build)
  if (constrained.length === 0) return null

  const lineCounts = countBy(constrained, (row) => row.line)
  const affectedLine = maxEntry(lineCounts)![0]
  const affectedRows = constrained.filter((row) => row.line === affectedLine)

  const monthCounts = countBy(affectedRows, (row) => row.weekStart.slice(0, 7))
  const peakMonth = maxEntry(monthCounts)![0]
  const peakRows = affectedRows.filter((row) => row.weekStart.startsWith(peakMonth))

  const weekCounts = countBy(peakRows, (row) => row.weekStart)
  const peakWeek = maxEntry(weekCounts)![0]
  const representative = peakRows
    .filter((row) => row.weekStart === peakWeek)
    .sort((a, b) => b.desiredBuild - b.build - (a.desiredBuild - a.build))[0]

  const multipleLines = new Set(rows.map((row) => row.line)).size > 1
  const lineFinding = multipleLines
    ? `${LINE_LABELS[affectedLine]} has the most constrained SKU-weeks (${units(affectedRows.length)}). `
    : ''

  return {
    category: 'Capacity pressure',
    tone: 'watch',
    body: `${lineFinding}Pressure${multipleLines ? ' on that line' : ''} peaks in ${monthYear(peakWeek)}, with ${units(peakRows.length)} constrained SKU-weeks.`,
    action: {
      label: 'View peak constrained week',
      sku: representative.sku,
      weekStart: representative.weekStart,
    },
  }
}

function countBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, number> {
  const counts = new Map<K, number>()
  for (const item of items) {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function maxEntry<K>(counts: Map<K, number>): [K, number] | null {
  let maximum: [K, number] | null = null
  for (const entry of counts) {
    if (!maximum || entry[1] > maximum[1]) maximum = entry
  }
  return maximum
}

function recommendedFocus(mix: SkuMixFinding | null, lines: LineKpi[]): Insight | null {
  if (mix && mix.lineHealthy && mix.worst.startingCoverage < mix.worst.targetWeeks) {
    const where = lines.length === 1 ? '' : ` on ${LINE_LABELS[mix.line]}`
    return {
      category: 'Recommended focus',
      tone: 'watch',
      body: `Prioritize rebalancing size mix${where}; aggregate line inventory is sufficient, but inventory is concentrated in the wrong SKU.`,
    }
  }

  const unfinished = lines.filter((line) => line.coverageAtEnd < line.targetWeeks)
  if (unfinished[0]) {
    return {
      category: 'Recommended focus',
      tone: 'watch',
      body: `Focus on ${LINE_LABELS[unfinished[0].line]} recovery; the line still finishes below its cover target.`,
    }
  }

  return null
}
