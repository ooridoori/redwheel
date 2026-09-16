/**
 * KPIs for whatever product group is on screen.
 *
 * Weeks of supply is only well defined for one line at a time — a road frame
 * cannot cover mountain demand — so with every line selected these figures are
 * reported as a range across lines rather than blended into a single average
 * that would mean nothing to a planner.
 */
import type { LineId } from '../domain'
import type { BuildPlan, LineKpi } from './index'

export type Scope = LineId | 'all'

export interface ScopeKpis {
  /** Target cover in force in the first week — what the table's Target column shows. */
  targetNowLow: number
  targetNowHigh: number
  /** Target cover in force at the end of the horizon, after any step-up. */
  targetLow: number
  targetHigh: number
  /** Cover at the snapshot. A range when several lines are in scope. */
  currentLow: number
  currentHigh: number
  /** Cover at the end of the horizon. A range when several lines are in scope. */
  projectedLow: number
  projectedHigh: number
  linesInScope: number
  linesAtTarget: number
  /** SKU × week rows in this scope. */
  skuWeeks: number
  skuWeeksAtTarget: number
  /** SKU-weeks below target where the SKU was also shorted of its asked build. */
  skuWeeksMissedToCapacity: number
  utilization: number
  totalBuild: number
  totalCapacity: number
  backlogAtStart: number
  backlogAtEnd: number
  backlogClearedWeek: string | null
  unmetDemand: number
}

export function scopeKpis(plan: BuildPlan, scope: Scope): ScopeKpis {
  const lines = scope === 'all' ? plan.kpis.lines : plan.kpis.lines.filter((line) => line.line === scope)

  const totalBuild = sum(lines, (line) => line.totalBuild)
  const totalCapacity = sum(lines, (line) => line.totalCapacity)

  // The scope's backlog is clear only once every line in it is clear.
  const weeksInOrder = plan.weeks
  const inScope = plan.lineWeeks.filter((entry) => scope === 'all' || entry.line === scope)
  const backlogClearedWeek =
    weeksInOrder.find((week) =>
      inScope.filter((entry) => entry.weekStart === week).every((entry) => entry.endingBacklog === 0),
    ) ?? null

  // Targets step up partway through the horizon, so "the target" depends on when
  // you ask. The first week is the one the table is showing.
  const firstWeekTargets = inScope
    .filter((entry) => entry.weekStart === plan.weeks[0])
    .map((entry) => entry.targetWeeks)

  const rows = plan.rows.filter((row) => scope === 'all' || row.line === scope)
  const skuWeeksAtTarget = rows.filter((row) => row.endingCoverage >= row.targetWeeks).length
  const skuWeeksMissedToCapacity = rows.filter(
    (row) => row.endingCoverage < row.targetWeeks && row.desiredBuild > row.build,
  ).length

  return {
    targetNowLow: firstWeekTargets.length === 0 ? 0 : Math.min(...firstWeekTargets),
    targetNowHigh: firstWeekTargets.length === 0 ? 0 : Math.max(...firstWeekTargets),
    targetLow: min(lines, (line) => line.targetWeeks),
    targetHigh: max(lines, (line) => line.targetWeeks),
    currentLow: min(lines, (line) => line.coverageAtStart),
    currentHigh: max(lines, (line) => line.coverageAtStart),
    projectedLow: min(lines, (line) => line.coverageAtEnd),
    projectedHigh: max(lines, (line) => line.coverageAtEnd),
    linesInScope: lines.length,
    linesAtTarget: lines.filter((line) => line.coverageAtEnd >= line.targetWeeks).length,
    skuWeeks: rows.length,
    skuWeeksAtTarget,
    skuWeeksMissedToCapacity,
    utilization: totalCapacity === 0 ? 0 : totalBuild / totalCapacity,
    totalBuild,
    totalCapacity,
    backlogAtStart: sum(lines, (line) => line.backlogAtStart),
    backlogAtEnd: sum(lines, (line) => line.backlogAtEnd),
    backlogClearedWeek,
    unmetDemand: sum(lines, (line) => line.unmetDemand),
  }
}

function sum(lines: LineKpi[], valueOf: (line: LineKpi) => number): number {
  return lines.reduce((total, line) => total + valueOf(line), 0)
}

function min(lines: LineKpi[], valueOf: (line: LineKpi) => number): number {
  return lines.length === 0 ? 0 : Math.min(...lines.map(valueOf))
}

function max(lines: LineKpi[], valueOf: (line: LineKpi) => number): number {
  return lines.length === 0 ? 0 : Math.max(...lines.map(valueOf))
}
