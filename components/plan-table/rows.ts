/**
 * Flattens the engine's output into table rows.
 *
 * Always one row per SKU per week. Capacity and targets are stated per line,
 * but stock, backlog and forecast are per SKU — and a line that looks healthy
 * can be hiding a starved size, so the SKU is the row a planner needs to see.
 */
import type { LineId, Product } from '@/lib/domain'
import { LINE_LABELS } from '@/lib/domain'
import type { BuildPlan, LineWeek, PlanRow } from '@/lib/engine'

export interface TableRow {
  key: string
  weekStart: string
  sku: string
  size: Product['size']
  line: LineId
  lineLabel: string
  forecast: number
  grossForecast: number
  absorbedByDealers: number
  startingInventory: number
  startingBacklog: number
  targetWeeks: number
  desiredBuild: number
  build: number
  /** The line's ceiling for the week, shared by every size on it. */
  capacity: number
  /** Units the whole line asked for, so a row can show why it was shorted. */
  lineDesired: number
  endingInventory: number
  endingCoverage: number
  atTarget: boolean
  rationed: boolean
  detail: { row: PlanRow; lineWeek: LineWeek }
}

export function buildTableRows(
  plan: BuildPlan,
  scope: LineId | 'all',
  weekWindow: string[],
): TableRow[] {
  const weeks = new Set(weekWindow)
  const lineWeekOf = new Map(plan.lineWeeks.map((entry) => [`${entry.weekStart}|${entry.line}`, entry]))

  return plan.rows
    .filter((row) => weeks.has(row.weekStart) && (scope === 'all' || row.line === scope))
    .map((row) => {
      const lineWeek = lineWeekOf.get(`${row.weekStart}|${row.line}`)!
      return {
        key: `${row.weekStart}|${row.sku}`,
        weekStart: row.weekStart,
        sku: row.sku,
        size: row.size,
        line: row.line,
        lineLabel: LINE_LABELS[row.line],
        forecast: row.forecast,
        grossForecast: row.grossForecast,
        absorbedByDealers: row.absorbedByDealers,
        startingInventory: row.startingInventory,
        startingBacklog: row.startingBacklog,
        targetWeeks: row.targetWeeks,
        desiredBuild: row.desiredBuild,
        build: row.build,
        capacity: lineWeek.capacity,
        lineDesired: lineWeek.desiredBuild,
        endingInventory: row.endingInventory,
        endingCoverage: row.endingCoverage,
        atTarget: row.endingCoverage >= row.targetWeeks,
        rationed: lineWeek.desiredBuild > lineWeek.capacity,
        detail: { row, lineWeek },
      }
    })
}
