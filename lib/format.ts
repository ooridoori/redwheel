/**
 * Display formatting.
 *
 * Kept out of components so every screen renders the same number the same way,
 * and so the table, the drawer and the charts can never disagree about what a
 * value looks like.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Whole bikes, with thousands separators. */
export function units(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

/** Units with an explicit sign, for deltas. */
export function signedUnits(value: number): string {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '\u2212'}${Math.abs(rounded).toLocaleString('en-US')}`
}

/** Weeks of cover. Signed when negative. Defaults to one decimal. */
export function weeks(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '\u2014'
  const sign = value < 0 ? '\u2212' : ''
  return `${sign}${Math.abs(value).toFixed(digits)}w`
}

/** Weeks of cover as a phrase, for outcome copy ("2.81 weeks"). */
export function weeksPhrase(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '\u2014'
  const sign = value < 0 ? '\u2212' : ''
  return `${sign}${Math.abs(value).toFixed(digits)} weeks`
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** `2026-09-07` to `Sep 7`. */
export function weekLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

/** `2026-09-07` to `Sep 7, 2026`. */
export function weekLabelLong(isoDate: string): string {
  const [year] = isoDate.split('-')
  return `${weekLabel(isoDate)}, ${year}`
}

/** `2026-09-07` to `Sep '26`, for axis ticks and the scrubber. */
export function monthLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  return `${MONTHS[Number(month) - 1]} '${year.slice(2)}`
}

export function quarterLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  return `Q${Math.floor((Number(month) - 1) / 3) + 1} ${year}`
}

export function yearOf(isoDate: string): string {
  return isoDate.slice(0, 4)
}

/** Compact form for axis labels and hero metrics: 92,369 to 92.4k. */
export function compactUnits(value: number): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (magnitude >= 10_000) return `${Math.round(value / 1_000)}k`
  if (magnitude >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return units(value)
}
