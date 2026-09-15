import Papa from 'papaparse'

export type CsvRow = Record<string, string>

export class CsvError extends Error {}

export function parseCsv(source: string, text: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })
  if (result.errors.length > 0) {
    const [first] = result.errors
    throw new CsvError(`${source}: ${first.message} (row ${first.row})`)
  }
  return result.data
}

/**
 * Reads a column that must exist.
 *
 * Redwheel's files arrived with no schema and no explanation, so a renamed or
 * missing column is a real possibility on the next drop. Failing loudly here
 * beats silently normalizing every row to `undefined`.
 */
export function field(row: CsvRow, source: string, column: string): string {
  const value = row[column]
  if (value === undefined) {
    throw new CsvError(`${source}: expected a "${column}" column, found ${Object.keys(row).join(', ')}`)
  }
  return value.trim()
}

export function optionalField(row: CsvRow, column: string): string | undefined {
  const value = row[column]
  return value === undefined || value.trim() === '' ? undefined : value.trim()
}

export function intField(row: CsvRow, source: string, column: string): number {
  const raw = field(row, source, column)
  const value = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(value)) throw new CsvError(`${source}: "${column}" is not a number: "${raw}"`)
  return value
}
