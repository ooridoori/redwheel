/**
 * The three date dialects Redwheel sent us, and the week grid we plan on.
 *
 * Each source file writes the same kind of value differently, and none of them
 * says which format it is using. `09/08/2025` is ambiguous on its face — we
 * read it as US month-first, which the data supports: the dealer file contains
 * values like `10/31/2025`, so the first field cannot be a day.
 */

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
}

export class DateParseError extends Error {
  constructor(value: string, dialect: string) {
    super(`Could not read "${value}" as ${dialect}`)
  }
}

/** `2025-09-08`, as used by every snake_case file. Returned unchanged. */
export function parseIsoDate(value: string): string {
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new DateParseError(value, 'ISO yyyy-mm-dd')
  return trimmed
}

/** `09/08/2025`, as used by the dealer files. Month first. */
export function parseUsDate(value: string): string {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!match) throw new DateParseError(value, 'US mm/dd/yyyy')
  const [, month, day, year] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/** `10-Sep-2025`, as used by the commercial PO log. Day first, month named. */
export function parseCommercialDate(value: string): string {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim())
  if (!match) throw new DateParseError(value, 'commercial dd-Mon-yyyy')
  const [, day, monthName, year] = match
  const month = MONTHS[monthName.toLowerCase()]
  if (!month) throw new DateParseError(value, 'commercial dd-Mon-yyyy')
  return `${year}-${month}-${day.padStart(2, '0')}`
}

/** Treats an empty cell as "no date", which is how unshipped orders are recorded. */
export function parseOptional(
  value: string | undefined,
  parse: (value: string) => string,
): string | null {
  if (value === undefined || value.trim() === '') return null
  return parse(value)
}

/** Calendar month, for grouping a year of order history. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * The Monday on or before an ISO date.
 *
 * Redwheel's capacity plan and forecasts are already keyed to Mondays, so
 * order history has to be bucketed the same way to be comparable.
 */
export function weekStartOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  const dayOfWeek = date.getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date.toISOString().slice(0, 10)
}

export function addWeeks(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

/** Every Monday from `from` to `to`, inclusive. */
export function weeksBetween(from: string, to: string): string[] {
  const weeks: string[] = []
  for (let week = weekStartOf(from); week <= to; week = addWeeks(week, 1)) {
    weeks.push(week)
  }
  return weeks
}

export function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}
