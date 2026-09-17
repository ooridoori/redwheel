/**
 * Presentation helpers for the aggregate line-cover chart.
 *
 * Every figure is taken from `plan.lineWeeks` / `plan.kpis.lines`. Nothing here
 * recomputes weeks of supply — it only decides what to label, what to dash,
 * and how to keep the target zone readable when one line is heavily overstocked.
 */
import { LINE_LABELS, type LineId } from '../domain'
import { targetWeeksFor } from './policy'
import type { BuildPlan } from './index'

export interface RecoveryEvent {
  line: LineId
  week: string
  targetWeeks: number
}

export interface OverflowLine {
  line: LineId
  peak: number
}

export interface CoverAxis {
  min: number
  max: number
  capped: boolean
  overflow: OverflowLine[]
}

export type AggregateTrajectoryState =
  | 'remains-below'
  | 'reaches-reference'
  | 'falls-below'
  | 'remains-at-or-above'

export interface AggregateCoverPoint {
  weekStart: string
  endingCoverage: number
  targetWeeks: number
}

export interface AggregateCoverSummary {
  state: AggregateTrajectoryState
  summary: string
  detail: string
}

/**
 * Describes the plotted aggregate trajectory without treating it as proof that
 * the line's individual SKUs meet their cover objectives.
 */
export function aggregateCoverSummary(
  line: LineId,
  points: AggregateCoverPoint[],
  rangeName: 'selected range' | 'planning horizon',
): AggregateCoverSummary | null {
  if (points.length === 0) return null

  const ordered = [...points].sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  const firstIsBelow = coverStatus(ordered[0].endingCoverage, ordered[0].targetWeeks) === 'Below target'
  const transition = firstIsBelow
    ? ordered.slice(1).find((point) => coverStatus(point.endingCoverage, point.targetWeeks) !== 'Below target')
    : ordered.slice(1).find((point) => coverStatus(point.endingCoverage, point.targetWeeks) === 'Below target')

  if (firstIsBelow && transition) {
    return {
      state: 'reaches-reference',
      summary: `Aggregate cover reaches ${transition.targetWeeks}w`,
      detail: `${LINE_LABELS[line]} reaches ${transition.targetWeeks}w aggregate cover in ${monthYear(transition.weekStart)}.`,
    }
  }

  if (!firstIsBelow && transition) {
    return {
      state: 'falls-below',
      summary: `Aggregate cover falls below ${transition.targetWeeks}w`,
      detail: `${LINE_LABELS[line]} falls below ${transition.targetWeeks}w aggregate cover in ${monthYear(transition.weekStart)}.`,
    }
  }

  const stableReference = ordered.every((point) => point.targetWeeks === ordered[0].targetWeeks)
  const reference = stableReference
    ? `${ordered[0].targetWeeks}w aggregate cover`
    : 'its weekly aggregate-cover reference'

  if (firstIsBelow) {
    return {
      state: 'remains-below',
      summary: `Aggregate cover remains below ${reference}`,
      detail: `${LINE_LABELS[line]} remains below ${reference} throughout the ${rangeName}.`,
    }
  }

  return {
    state: 'remains-at-or-above',
    summary: `Aggregate cover remains at/above ${reference}`,
    detail: `${LINE_LABELS[line]} remains at or above ${reference} throughout the ${rangeName}.`,
  }
}

/** Lines that opened below target and later reach it, using the engine's first-at-target week. */
export function recoveryEvents(plan: BuildPlan, lines: LineId[]): RecoveryEvent[] {
  const events: RecoveryEvent[] = []

  for (const line of lines) {
    const kpi = plan.kpis.lines.find((entry) => entry.line === line)
    if (!kpi?.firstWeekAtTarget) continue

    const openingTarget = targetWeeksFor(plan.policy, line, plan.weeks[0])
    if (kpi.coverageAtStart >= openingTarget) continue

    const recovered = plan.lineWeeks.find(
      (entry) => entry.line === line && entry.weekStart === kpi.firstWeekAtTarget,
    )
    events.push({
      line,
      week: kpi.firstWeekAtTarget,
      targetWeeks: recovered?.targetWeeks ?? openingTarget,
    })
  }

  return events
}

export function coverAxis(plan: BuildPlan, lines: LineId[]): CoverAxis {
  const inScope = plan.lineWeeks.filter((entry) => lines.includes(entry.line))
  const covers = inScope.map((entry) => entry.endingCoverage)
  const starts = inScope.map((entry) => entry.startingCoverage)
  const targets = inScope.map((entry) => entry.targetWeeks)
  const values = [...covers, ...starts]

  const dataMin = values.length === 0 ? 0 : Math.min(...values)
  const dataMax = values.length === 0 ? 0 : Math.max(...values)
  const targetTop = targets.length === 0 ? 0 : Math.max(...targets)

  // Keep the 8–15w target band readable. Headroom of ~5w above the highest
  // target is enough to see a line recover without letting a 30w+ overstock
  // flatten everyone else against the x-axis.
  const readableMax = Math.max(20, Math.ceil(targetTop / 2) * 2 + 4)
  const niceMin = dataMin >= 0 ? 0 : Math.floor(dataMin / 2) * 2
  const needsCap = dataMax > readableMax + 1
  const paddedMax = Math.ceil((Math.max(dataMax, targetTop) + 2) / 2) * 2

  const overflow = needsCap
    ? lines
        .map((line) => {
          const peak = Math.max(
            0,
            ...inScope.filter((entry) => entry.line === line).map((entry) => entry.endingCoverage),
          )
          return { line, peak }
        })
        .filter((entry) => entry.peak > readableMax)
        .sort((a, b) => b.peak - a.peak)
    : []

  return {
    min: niceMin,
    max: needsCap ? readableMax : paddedMax,
    capped: needsCap,
    overflow,
  }
}

export function coverStatus(
  coverage: number,
  targetWeeks: number,
): 'Above target' | 'At target' | 'Below target' {
  if (coverage < targetWeeks - 0.05) return 'Below target'
  if (coverage <= targetWeeks + 0.05) return 'At target'
  return 'Above target'
}

export function recoveryCaption(event: RecoveryEvent): string {
  return `${LINE_LABELS[event.line]} reaches ${event.targetWeeks}w aggregate cover \u00b7 ${monthYear(event.week)}`
}

/** `2027-08-23` → `Aug 2027`. */
export function monthYear(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Number(month) - 1]} ${year}`
}
