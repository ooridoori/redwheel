/**
 * Capacity and forecast — the two files that were already weekly.
 *
 * These arrived in the cleanest shape of the nine: already keyed to Monday
 * week starts, already lowercase. The only work is typing them and, for
 * forecasts, tagging each row with the channel its file represents.
 */
import type { CapacitySlot, Channel, ForecastPoint } from '../domain'
import { lineOf } from '../domain'
import { parseIsoDate } from './dates'
import { toBikeClass, toTrim } from './enums'
import { field, intField, parseCsv } from './csv'

/** `capacity_plan.csv` — weekly build ceiling per production line. Varies over time. */
export function readCapacity(text: string): CapacitySlot[] {
  const source = 'capacity_plan.csv'
  return parseCsv(source, text).map((row) => ({
    weekStart: parseIsoDate(field(row, source, 'week_start')),
    line: lineOf(toBikeClass(field(row, source, 'class')), toTrim(field(row, source, 'trim'))),
    units: intField(row, source, 'capacity_units'),
  }))
}

/**
 * One of `forecast_dtc.csv`, `forecast_dealer.csv`, `forecast_commercial.csv`.
 *
 * The channel is only recorded in the filename, so the caller supplies it.
 */
export function readForecast(text: string, channel: Channel, source: string): ForecastPoint[] {
  return parseCsv(source, text).map((row) => ({
    weekStart: parseIsoDate(field(row, source, 'week_start')),
    sku: field(row, source, 'sku'),
    channel,
    units: intField(row, source, 'forecast_units'),
  }))
}
