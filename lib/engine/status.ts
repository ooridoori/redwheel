/**
 * Presentation of an already-computed plan row.
 *
 * Every figure is taken from the engine output. These helpers only choose
 * labels so the table and drawer tell the same story.
 */
import { units, weeksPhrase } from '../format'

export interface OutcomeFields {
  targetWeeks: number
  endingCoverage: number
  desiredBuild: number
  build: number
}

export function atTarget(row: OutcomeFields): boolean {
  return row.endingCoverage >= row.targetWeeks
}

export function shortedByCapacity(row: OutcomeFields): boolean {
  return row.desiredBuild > row.build
}

/** How many weeks short of the target the plan leaves this SKU. */
export function weeksBelowTarget(row: OutcomeFields): number {
  return row.targetWeeks - row.endingCoverage
}

export function skuStatus(row: OutcomeFields): {
  met: boolean
  shorted: boolean
  label: string
  detail: string | null
} {
  const met = atTarget(row)
  const shorted = shortedByCapacity(row)
  if (met) {
    return { met: true, shorted, label: 'Target met', detail: null }
  }
  return {
    met: false,
    shorted,
    label: `${weeksPhrase(weeksBelowTarget(row), 1)} below target`,
    detail: shorted ? 'Short due to line capacity' : null,
  }
}

export function weekTargetSummary(rows: OutcomeFields[]): { primary: string; secondary: string | null } {
  const total = rows.length
  const met = rows.filter(atTarget).length
  const missed = total - met
  if (missed === 0) {
    return { primary: `All ${units(total)} SKUs meet target cover`, secondary: null }
  }
  const dueToCapacity = rows.filter((row) => !atTarget(row) && shortedByCapacity(row)).length
  return {
    primary: `${units(met)} of ${units(total)} SKUs meet target cover`,
    secondary:
      dueToCapacity === missed
        ? `${units(missed)} remain below target due to capacity constraints`
        : `${units(missed)} remain below target`,
  }
}
