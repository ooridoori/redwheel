/**
 * Redwheel master data vocabulary.
 *
 * Redwheel handed us nine CSVs written in three different dialects. This file
 * is the single canonical definition every one of them is translated into.
 *
 * Dates are ISO `YYYY-MM-DD` strings rather than `Date` objects. Weekly
 * planning only ever compares and groups by calendar week, so strings sort
 * correctly, serialize to JSON unchanged, and cannot drift across timezones.
 */

/** Road or mountain bike. Source files spell this `road`/`Road` and `mtb`/`MTB`. */
export type BikeClass = 'road' | 'mtb'

/**
 * Frame tier. `base` is aluminium, `carbon` is carbon fibre — pricier, slower
 * to build, and held to a deeper buffer. The commercial PO log calls this
 * column `Material`.
 */
export type Trim = 'base' | 'carbon'

/** Frame size. The commercial PO log calls this column `Length`. */
export type Size = 'S' | 'M' | 'L'

/** Route to a buyer: Redwheel's own web store, wholesale bike shops, or fleet accounts. */
export type Channel = 'dtc' | 'dealer' | 'commercial'

/**
 * A production line, identified by the class and trim it builds.
 *
 * This is the unit capacity is expressed in, which makes it the unit
 * allocation happens in: all three sizes of carbon mountain bike compete for
 * one line's weekly units.
 */
export type LineId = `${BikeClass}-${Trim}`

/** Who physically holds stock. Dealer-held stock is already sold and cannot be reallocated. */
export type StockOwner = 'redwheel' | 'dealer'

export interface Product {
  sku: string
  class: BikeClass
  trim: Trim
  size: Size
  line: LineId
}

/** One order line from any channel, after translation into common terms. */
export interface Order {
  orderId: string
  channel: Channel
  sku: string
  /** When the order was placed. */
  orderDate: string
  /** When the buyer asked to receive it. DTC web orders do not state one. */
  requestedDate: string | null
  qty: number
  /** False means Redwheel still owes these units — this is what forms backlog. */
  isFulfilled: boolean
  /** Null exactly when unfulfilled. */
  shipDate: string | null
  /** Per-unit price in the currency of that channel: retail, wholesale, or negotiated. */
  unitPrice: number
  /** US state, where the source file records one. */
  region: string | null
  /** Dealer or commercial account name. Null for DTC, which is per-consumer. */
  account: string | null
}

/** On-hand units at one location for one SKU. */
export interface StockPosition {
  /** Date the count was taken. Not uniform across dealers — see data notes. */
  asOf: string
  sku: string
  locationCode: string
  locationName: string
  owner: StockOwner
  onHand: number
}

/** The factory ceiling for one line in one week. */
export interface CapacitySlot {
  weekStart: string
  line: LineId
  units: number
}

/** Forecast demand for one SKU, in one week, from one channel. */
export interface ForecastPoint {
  weekStart: string
  sku: string
  channel: Channel
  units: number
}

/**
 * Something we observed in the source files that a planner should know about.
 *
 * `severity` separates the two things Atomic asked us to keep apart: what the
 * files say (`info`), versus where we had to make a judgement call that could
 * be wrong (`warning`).
 */
export interface DataNote {
  severity: 'info' | 'warning'
  source: string
  message: string
}

/** The consolidated result of Part 1: every source file in one schema. */
export interface MasterData {
  /** The inventory snapshot date, which anchors week one of the plan. */
  asOf: string
  products: Product[]
  orders: Order[]
  stock: StockPosition[]
  capacity: CapacitySlot[]
  forecast: ForecastPoint[]
  notes: DataNote[]
}

export const lineOf = (bikeClass: BikeClass, trim: Trim): LineId => `${bikeClass}-${trim}`

export const LINES: LineId[] = ['road-base', 'road-carbon', 'mtb-base', 'mtb-carbon']

export const LINE_LABELS: Record<LineId, string> = {
  'road-base': 'Road — Base',
  'road-carbon': 'Road — Carbon',
  'mtb-base': 'Mountain — Base',
  'mtb-carbon': 'Mountain — Carbon',
}

export const CHANNELS: Channel[] = ['dtc', 'dealer', 'commercial']

export const CHANNEL_LABELS: Record<Channel, string> = {
  dtc: 'Direct to consumer',
  dealer: 'Dealer',
  commercial: 'Commercial',
}
