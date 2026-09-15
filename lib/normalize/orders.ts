/**
 * One adapter per channel.
 *
 * All three files describe the same thing — a promise to deliver N units of a
 * SKU — but they disagree on column names, casing, date format, and how they
 * spell "yes". The column maps below are the entire translation, kept side by
 * side so the differences are visible rather than buried in branches.
 */
import type { Order } from '../domain'
import { parseCommercialDate, parseIsoDate, parseOptional, parseUsDate } from './dates'
import { toBikeClass, toSize, toTrim } from './enums'
import { field, intField, optionalField, parseCsv, type CsvRow } from './csv'
import { toBoolean } from './enums'

export interface OrderAdapterResult {
  orders: Order[]
  /** SKU attributes as this file states them, so callers can cross-check the files against each other. */
  observed: ObservedProduct[]
}

export interface ObservedProduct {
  sku: string
  class: ReturnType<typeof toBikeClass>
  trim: ReturnType<typeof toTrim>
  size: ReturnType<typeof toSize>
  source: string
}

/** `dtc_web_orders.csv` — snake_case, ISO dates, lowercase enums, `true`/`false`. */
export function readDtcOrders(text: string): OrderAdapterResult {
  const source = 'dtc_web_orders.csv'
  const rows = parseCsv(source, text)
  return {
    orders: rows.map((row) => ({
      orderId: field(row, source, 'order_id'),
      channel: 'dtc' as const,
      sku: field(row, source, 'sku'),
      orderDate: parseIsoDate(field(row, source, 'order_date')),
      requestedDate: null,
      qty: intField(row, source, 'qty'),
      isFulfilled: toBoolean(field(row, source, 'is_fulfilled')),
      shipDate: parseOptional(optionalField(row, 'ship_date'), parseIsoDate),
      unitPrice: intField(row, source, 'unit_price'),
      region: optionalField(row, 'ship_to_state') ?? null,
      account: null,
    })),
    observed: observe(rows, source, 'sku', 'class', 'trim', 'size'),
  }
}

/** `dealer_orders_export.csv` — Title Case headers, US dates, `Y`/`N`. */
export function readDealerOrders(text: string): OrderAdapterResult {
  const source = 'dealer_orders_export.csv'
  const rows = parseCsv(source, text)
  return {
    orders: rows.map((row) => ({
      orderId: field(row, source, 'Dealer Order #'),
      channel: 'dealer' as const,
      sku: field(row, source, 'SKU'),
      orderDate: parseUsDate(field(row, source, 'Order Date')),
      requestedDate: parseOptional(optionalField(row, 'Requested Ship Date'), parseUsDate),
      qty: intField(row, source, 'Qty'),
      isFulfilled: toBoolean(field(row, source, 'Fulfilled (Y/N)')),
      shipDate: parseOptional(optionalField(row, 'Shipped'), parseUsDate),
      unitPrice: intField(row, source, 'Wholesale Price'),
      region: optionalField(row, 'State') ?? null,
      account: optionalField(row, 'Dealer Name') ?? null,
    })),
    observed: observe(rows, source, 'SKU', 'Class', 'Trim', 'Size'),
  }
}

/**
 * `Commercial_PO_Log.csv` — purchase-order vocabulary throughout.
 *
 * The SKU lives in `Product`, size in `Length`, trim in `Material`, the
 * requested date in `Need By`, and the ship date in `Delivered`. Dates are
 * `10-Sep-2025`.
 */
export function readCommercialOrders(text: string): OrderAdapterResult {
  const source = 'Commercial_PO_Log.csv'
  const rows = parseCsv(source, text)
  return {
    orders: rows.map((row) => ({
      orderId: field(row, source, 'PO Number'),
      channel: 'commercial' as const,
      sku: field(row, source, 'Product'),
      orderDate: parseCommercialDate(field(row, source, 'PO Date')),
      requestedDate: parseOptional(optionalField(row, 'Need By'), parseCommercialDate),
      qty: intField(row, source, 'Units'),
      isFulfilled: toBoolean(field(row, source, 'Fulfilled')),
      shipDate: parseOptional(optionalField(row, 'Delivered'), parseCommercialDate),
      unitPrice: intField(row, source, 'Net Price'),
      region: null,
      account: optionalField(row, 'Account') ?? null,
    })),
    observed: observe(rows, source, 'Product', 'Class', 'Material', 'Length'),
  }
}

function observe(
  rows: CsvRow[],
  source: string,
  skuColumn: string,
  classColumn: string,
  trimColumn: string,
  sizeColumn: string,
): ObservedProduct[] {
  const seen = new Map<string, ObservedProduct>()
  for (const row of rows) {
    const sku = field(row, source, skuColumn)
    if (seen.has(sku)) continue
    seen.set(sku, {
      sku,
      class: toBikeClass(field(row, source, classColumn)),
      trim: toTrim(field(row, source, trimColumn)),
      size: toSize(field(row, source, sizeColumn)),
      source,
    })
  }
  return [...seen.values()]
}
