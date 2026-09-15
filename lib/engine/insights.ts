/**
 * Plain-language readings of the plan on screen.
 *
 * Every sentence is computed from the current plan and the current product
 * group, so changing a target, a rationing rule or the filter changes the
 * narrative with it. Nothing here is pre-written about Redwheel.
 */
import { LINE_LABELS } from '../domain'
import { units, weekLabelLong, weeks as formatWeeks, percent } from '../format'
import type { BuildPlan, LineKpi, PlanRow } from './index'
import type { Scope } from './scope'

export interface Insight {
  title: string
  body: string
  tone: 'neutral' | 'good' | 'watch'
  /** Rendered as a single line without its own heading, to keep the panel short. */
  compact?: boolean
}

export function insightsFor(plan: BuildPlan, scope: Scope): Insight[] {
  const lines = scope === 'all' ? plan.kpis.lines : plan.kpis.lines.filter((line) => line.line === scope)
  if (lines.length === 0) return []

  return [status(plan, lines), mix(plan, scope), constraint(plan, lines)].filter(
    (insight): insight is Insight => insight !== null,
  )
}

/** Where the scope stands, and when it gets where it needs to be. */
function status(plan: BuildPlan, lines: LineKpi[]): Insight {
  const worst = [...lines].sort(
    (a, b) => a.coverageAtStart - a.targetWeeks - (b.coverageAtStart - b.targetWeeks),
  )[0]
  const gap = worst.targetWeeks - worst.coverageAtStart
  const atTarget = lines.filter((line) => line.coverageAtEnd >= line.targetWeeks).length

  const recovery = worst.firstWeekAtTarget
    ? `Reaches target ${weekLabelLong(worst.firstWeekAtTarget)}`
    : 'Never reaches target in the horizon'

  const backlog = worst.backlogClearedWeek
    ? `backlog clears ${weekLabelLong(worst.backlogClearedWeek)}`
    : `${units(worst.backlogAtEnd)} units still owed at the end`

  if (gap <= 0) {
    return {
      title: 'Status',
      tone: 'good',
      body: `Every line opens at or above target. ${LINE_LABELS[worst.line]} is tightest at ${formatWeeks(worst.coverageAtStart)} against ${worst.targetWeeks}w. ${backlog}.`,
    }
  }

  return {
    title: 'Status',
    tone: 'watch',
    body: `${LINE_LABELS[worst.line]} is ${gap.toFixed(1)}w below its ${worst.targetWeeks}w target. ${recovery}, and ${backlog}.${
      lines.length > 1 ? ` ${atTarget} of ${lines.length} lines finish at target.` : ''
    }`,
  }
}

/**
 * The finding a line-level view hides: a line at target while a size inside it
 * starves. Picks the widest spread between SKUs on one line.
 */
function mix(plan: BuildPlan, scope: Scope): Insight | null {
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
  const looksFine = lineWeeks.every((entry) => entry.atTarget)

  return {
    title: 'Size mix',
    tone: 'watch',
    body: `${LINE_LABELS[widest.worst.line]} ${
      looksFine ? 'is at target every week as one line' : 'looks on track as one line'
    }, but size ${widest.worst.size} (${widest.worst.sku}) opens at ${formatWeeks(widest.worst.startingCoverage)} while size ${widest.best.size} (${widest.best.sku}) holds ${formatWeeks(widest.best.startingCoverage)}. The plan allocates per SKU.`,
  }
}

/**
 * What is actually limiting the plan. Kept to one line: the capacity figure is
 * already a KPI, so this only has to add what the KPI cannot say.
 */
function constraint(plan: BuildPlan, lines: LineKpi[]): Insight {
  const tightest = [...lines].sort((a, b) => b.utilization - a.utilization)[0]
  const totalBuild = lines.reduce((total, line) => total + line.totalBuild, 0)
  const totalCapacity = lines.reduce((total, line) => total + line.totalCapacity, 0)
  const utilization = totalCapacity === 0 ? 0 : totalBuild / totalCapacity

  return {
    title: 'Constraint',
    tone: utilization > 0.9 ? 'watch' : 'neutral',
    compact: true,
    body:
      lines.length > 1
        ? `${units(totalBuild)} units planned. ${LINE_LABELS[tightest.line]} is the tightest line at ${percent(tightest.utilization, 0)}. Lines cannot share capacity.`
        : `${units(totalBuild)} units planned at ${percent(utilization, 0)} of capacity.`,
  }
}
