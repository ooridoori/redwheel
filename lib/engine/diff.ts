/**
 * What changed between two runs of the engine.
 *
 * Re-running under a new assumption repaints in about a sixth of a second, so
 * without this the screen just silently becomes a different screen. The diff
 * lets the UI point at the numbers that actually moved.
 *
 * Values are compared *as rendered*, not as floats: a cover figure that shifts
 * by a thousandth of a week still prints `12.4w`, and highlighting a number
 * that looks identical would teach the reader to distrust the highlight.
 */
import { units, weeks } from '../format'
import type { BuildPlan } from './index'

export interface PlanDiff {
  /** `weekStart|sku` keys whose build quantity changed. */
  build: Set<string>
  /** `weekStart|sku` keys whose end-of-week cover changed. */
  cover: Set<string>
  /** False before the first re-run, when there is nothing to compare against. */
  hasPrevious: boolean
}

export const NO_DIFF: PlanDiff = { build: new Set(), cover: new Set(), hasPrevious: false }

export function diffPlans(current: BuildPlan, previous: BuildPlan | null): PlanDiff {
  if (!previous) return NO_DIFF

  const before = new Map(previous.rows.map((row) => [`${row.weekStart}|${row.sku}`, row]))
  const build = new Set<string>()
  const cover = new Set<string>()

  for (const row of current.rows) {
    const key = `${row.weekStart}|${row.sku}`
    const was = before.get(key)
    if (!was) continue

    if (units(row.build) !== units(was.build)) build.add(key)
    if (weeks(row.endingCoverage) !== weeks(was.endingCoverage)) cover.add(key)
  }

  return { build, cover, hasPrevious: true }
}
