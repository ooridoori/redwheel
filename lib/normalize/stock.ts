/**
 * The two inventory files.
 *
 * They look alike but mean different things. The plant snapshot is stock
 * Redwheel owns and can still decide what to do with. The dealer report is
 * stock that has already been sold into bike shops — visible, but not
 * available to allocate.
 */
import type { StockPosition } from '../domain'
import { parseIsoDate, parseUsDate } from './dates'
import { field, intField, parseCsv } from './csv'

/** `plant_inventory_snapshot.csv` — Redwheel's own plant and DC stock, one shared as-of date. */
export function readPlantStock(text: string): StockPosition[] {
  const source = 'plant_inventory_snapshot.csv'
  return parseCsv(source, text).map((row) => ({
    asOf: parseIsoDate(field(row, source, 'as_of_date')),
    sku: field(row, source, 'sku'),
    locationCode: field(row, source, 'location_code'),
    locationName: field(row, source, 'location_name'),
    owner: 'redwheel' as const,
    onHand: intField(row, source, 'on_hand_qty'),
  }))
}

/**
 * `dealer_stock_report.csv` — dealer-reported on-hand.
 *
 * Each row carries its own `Count Date`, and they are not all the same day.
 * This is self-reported data collected over a week, not a synchronized count.
 */
export function readDealerStock(text: string): StockPosition[] {
  const source = 'dealer_stock_report.csv'
  return parseCsv(source, text).map((row) => ({
    asOf: parseUsDate(field(row, source, 'Count Date')),
    sku: field(row, source, 'Item'),
    locationCode: field(row, source, 'Dealer #'),
    locationName: field(row, source, 'Dealer'),
    owner: 'dealer' as const,
    onHand: intField(row, source, 'On Hand'),
  }))
}
