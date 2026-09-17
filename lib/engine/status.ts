/**
 * Presentation of an already-computed plan row.
 *
 * Every figure is taken from the engine output. These helpers only choose
 * labels so the table and drawer tell the same story.
 */
import { units, weeks, weeksPhrase } from '../format'

export interface OutcomeFields {
  targetWeeks: number
  endingCoverage: number
  desiredBuild: number
  build: number
}

export function atTarget(row: Pick<OutcomeFields, 'endingCoverage' | 'targetWeeks'>): boolean {
  return row.endingCoverage >= row.targetWeeks
}

export function shortedByCapacity(row: Pick<OutcomeFields, 'desiredBuild' | 'build'>): boolean {
  return row.desiredBuild > row.build
}

/** How many weeks short of the target the plan leaves this SKU. */
export function weeksBelowTarget(row: Pick<OutcomeFields, 'endingCoverage' | 'targetWeeks'>): number {
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

/** Table copy: projected cover first, gap to target second — never the ranking input. */
export function projectedCoverCopy(row: Pick<OutcomeFields, 'endingCoverage' | 'targetWeeks'>): {
  primary: string
  secondary: string | null
} {
  const primary = `${weeks(row.endingCoverage)} projected`
  if (atTarget(row)) {
    return { primary, secondary: 'Target met' }
  }
  return {
    primary,
    secondary: `${weeks(weeksBelowTarget(row))} below ${row.targetWeeks}w target`,
  }
}

export function wellAboveTarget(coverage: number, targetWeeks: number): boolean {
  return coverage >= targetWeeks * 2
}

/** Short gloss for an extreme cover figure so it does not look like a broken calc. */
export function coverGloss(coverage: number, targetWeeks: number): string | null {
  if (!wellAboveTarget(coverage, targetWeeks)) return null
  return `${weeksPhrase(coverage)} \u2014 well above the ${targetWeeks}-week target`
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
