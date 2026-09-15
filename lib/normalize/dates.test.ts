import { describe, expect, it } from 'vitest'
import {
  addWeeks,
  DateParseError,
  parseCommercialDate,
  parseIsoDate,
  parseOptional,
  parseUsDate,
  weekStartOf,
  weeksBetween,
} from './dates'

describe('the three date dialects', () => {
  it('reads DTC ISO dates unchanged', () => {
    expect(parseIsoDate('2025-09-08')).toBe('2025-09-08')
  })

  it('reads dealer dates as month-first', () => {
    expect(parseUsDate('09/08/2025')).toBe('2025-09-08')
    expect(parseUsDate('10/31/2025')).toBe('2025-10-31')
  })

  it('reads commercial dates as day-first with a named month', () => {
    expect(parseCommercialDate('10-Sep-2025')).toBe('2025-09-10')
    expect(parseCommercialDate('1-Jan-2026')).toBe('2026-01-01')
  })

  it('agrees across all three dialects for the same day', () => {
    const iso = parseIsoDate('2025-09-08')
    expect(parseUsDate('09/08/2025')).toBe(iso)
    expect(parseCommercialDate('8-Sep-2025')).toBe(iso)
  })

  it('refuses a value in the wrong dialect rather than guessing', () => {
    expect(() => parseIsoDate('09/08/2025')).toThrow(DateParseError)
    expect(() => parseUsDate('2025-09-08')).toThrow(DateParseError)
    expect(() => parseCommercialDate('10-Xyz-2025')).toThrow(DateParseError)
  })

  it('treats a blank cell as no date, which is how unshipped orders are recorded', () => {
    expect(parseOptional('', parseIsoDate)).toBeNull()
    expect(parseOptional(undefined, parseIsoDate)).toBeNull()
    expect(parseOptional('2025-09-08', parseIsoDate)).toBe('2025-09-08')
  })
})

describe('the weekly grid', () => {
  it('snaps any day to the Monday on or before it', () => {
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07')
    expect(weekStartOf('2026-09-13')).toBe('2026-09-07')
    expect(weekStartOf('2026-09-14')).toBe('2026-09-14')
  })

  it("matches Redwheel's own week starts, which are Mondays", () => {
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07')
    expect(weekStartOf('2028-12-25')).toBe('2028-12-25')
  })

  it('steps forward and backward in whole weeks across month and year ends', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
    expect(addWeeks('2027-01-04', -1)).toBe('2026-12-28')
  })

  it('enumerates an inclusive range of Mondays', () => {
    expect(weeksBetween('2026-09-07', '2026-09-28')).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ])
  })
})
