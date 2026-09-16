/**
 * The seam between Part 1 and Part 2.
 *
 * `MasterData` is the full consolidated record — every one of the ~14,000
 * order lines. The allocation engine does not need order lines; it needs
 * opening stock, backlog, weekly demand and weekly capacity. `PlanningInputs`
 * is that projection: a few hundred kilobytes instead of megabytes, small
 * enough to ship to the browser so the engine can re-run on every slider move.
 */
import type { Channel, DataNote, LineId, MasterData, Product } from './domain'
import { monthOf, weekStartOf } from './normalize/dates'

/** Lookup keyed by SKU, then by week start. */
export type BySkuWeek = Record<string, Record<string, number>>

/** Lookup keyed by production line, then by week start. */
export type ByLineWeek = Record<LineId, Record<string, number>>

export interface HistoryPoint {
  month: string
  channel: Channel
  units: number
  orderLines: number
}

/** One of the nine files Redwheel sent, and what it became. */
export interface SourceSummary {
  file: string
  rows: number
  becomes: string
  /** The dialect quirk that had to be reconciled, where there was one. */
  quirk?: string
}

export interface PlanningInputs {
  /** Snapshot date. Also the first week of the plan. */
  asOf: string
  /** Weeks we can build in — bounded by the capacity plan. */
  planWeeks: string[]
  /** Weeks we have demand for — runs past the plan, and is needed to measure coverage at the end of it. */
  forecastWeeks: string[]
  products: Product[]
  /** Units Redwheel holds and can allocate, by SKU. */
  openingStock: Record<string, number>
  /** Units sitting with dealers, by SKU. Already sold; informational only, never allocated. */
  dealerStock: Record<string, number>
  /** Unfulfilled units owed, by SKU. */
  backlog: Record<string, number>
  backlogByChannel: Record<Channel, number>
  /** Total forecast demand across all three channels. */
  demand: BySkuWeek
  /** Forecast demand split by channel, for the data view. */
  demandByChannel: Record<Channel, BySkuWeek>
  capacity: ByLineWeek
  /** A year of order history, rolled up for display. */
  history: HistoryPoint[]
  sources: SourceSummary[]
  notes: DataNote[]
}

export function derivePlanningInputs(master: MasterData): PlanningInputs {
  const planWeeks = sortedUnique(master.capacity.map((slot) => slot.weekStart)).filter(
    (week) => week >= master.asOf,
  )
  const forecastWeeks = sortedUnique(master.forecast.map((point) => point.weekStart))

  const openingStock = sumBy(
    master.stock.filter((position) => position.owner === 'redwheel'),
    (position) => position.sku,
    (position) => position.onHand,
  )
  const dealerStock = sumBy(
    master.stock.filter((position) => position.owner === 'dealer'),
    (position) => position.sku,
    (position) => position.onHand,
  )

  const unfulfilled = master.orders.filter((order) => !order.isFulfilled)
  const backlog = sumBy(unfulfilled, (order) => order.sku, (order) => order.qty)
  const backlogByChannel = emptyChannelTotals()
  for (const order of unfulfilled) backlogByChannel[order.channel] += order.qty

  const demand: BySkuWeek = {}
  const demandByChannel: Record<Channel, BySkuWeek> = { dtc: {}, dealer: {}, commercial: {} }
  for (const point of master.forecast) {
    add(demand, point.sku, point.weekStart, point.units)
    add(demandByChannel[point.channel], point.sku, point.weekStart, point.units)
  }

  const capacity = { 'road-base': {}, 'road-carbon': {}, 'mtb-base': {}, 'mtb-carbon': {} } as ByLineWeek
  for (const slot of master.capacity) {
    capacity[slot.line][slot.weekStart] = slot.units
  }

  return {
    asOf: master.asOf,
    planWeeks,
    forecastWeeks,
    products: master.products,
    openingStock: fillMissing(openingStock, master.products),
    dealerStock: fillMissing(dealerStock, master.products),
    backlog: fillMissing(backlog, master.products),
    backlogByChannel,
    demand,
    demandByChannel,
    capacity,
    history: rollUpHistory(master),
    sources: summarizeSources(master),
    notes: master.notes,
  }
}

/** What arrived, and what each file turned into. Counts are measured, not asserted. */
function summarizeSources(master: MasterData): SourceSummary[] {
  const orders = (channel: Channel) => master.orders.filter((order) => order.channel === channel).length
  const forecast = (channel: Channel) => master.forecast.filter((point) => point.channel === channel).length

  return [
    {
      file: 'dtc_web_orders.csv',
      rows: orders('dtc'),
      becomes: 'Orders, DTC channel',
      quirk: 'snake_case, ISO dates, true/false',
    },
    {
      file: 'dealer_orders_export.csv',
      rows: orders('dealer'),
      becomes: 'Orders, dealer channel',
      quirk: 'Title Case, 09/08/2025 dates, Y/N',
    },
    {
      file: 'Commercial_PO_Log.csv',
      rows: orders('commercial'),
      becomes: 'Orders, commercial channel',
      quirk: 'Product, Length, Material; 10-Sep-2025 dates, Yes/No',
    },
    {
      file: 'plant_inventory_snapshot.csv',
      rows: master.stock.filter((position) => position.owner === 'redwheel').length,
      becomes: 'Opening stock Redwheel can allocate',
      quirk: 'Single shared as-of date',
    },
    {
      file: 'dealer_stock_report.csv',
      rows: master.stock.filter((position) => position.owner === 'dealer').length,
      becomes: 'Dealer-held inventory (already sold; not used in the plan)',
      quirk: 'Counts taken across six different days',
    },
    {
      file: 'capacity_plan.csv',
      rows: master.capacity.length,
      becomes: 'Weekly ceiling per production line',
      quirk: 'Ceilings change over the horizon',
    },
    { file: 'forecast_dtc.csv', rows: forecast('dtc'), becomes: 'Forecast demand, DTC' },
    { file: 'forecast_dealer.csv', rows: forecast('dealer'), becomes: 'Forecast demand, dealer' },
    { file: 'forecast_commercial.csv', rows: forecast('commercial'), becomes: 'Forecast demand, commercial' },
  ]
}

/** Monthly order units per channel, from the year of history. */
function rollUpHistory(master: MasterData): HistoryPoint[] {
  const buckets = new Map<string, HistoryPoint>()
  for (const order of master.orders) {
    const month = monthOf(order.orderDate)
    const key = `${month}|${order.channel}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.units += order.qty
      bucket.orderLines += 1
    } else {
      buckets.set(key, { month, channel: order.channel, units: order.qty, orderLines: 1 })
    }
  }
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month) || a.channel.localeCompare(b.channel))
}

/** Total demand for a SKU over `weeks` consecutive weeks starting at `from`. */
export function demandOver(inputs: PlanningInputs, sku: string, from: string, weeks: number): number {
  const series = inputs.demand[sku] ?? {}
  const index = inputs.forecastWeeks.indexOf(from)
  if (index === -1) return 0
  let total = 0
  for (const week of inputs.forecastWeeks.slice(index, index + weeks)) {
    total += series[week] ?? 0
  }
  return total
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort()
}

function add(target: BySkuWeek, sku: string, week: string, units: number): void {
  target[sku] ??= {}
  target[sku][week] = (target[sku][week] ?? 0) + units
}

function sumBy<T>(items: T[], keyOf: (item: T) => string, valueOf: (item: T) => number): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const item of items) {
    const key = keyOf(item)
    totals[key] = (totals[key] ?? 0) + valueOf(item)
  }
  return totals
}

/** Guarantees a value for every SKU so downstream code never has to guard for undefined. */
function fillMissing(totals: Record<string, number>, products: Product[]): Record<string, number> {
  const filled: Record<string, number> = {}
  for (const product of products) filled[product.sku] = totals[product.sku] ?? 0
  return filled
}

function emptyChannelTotals(): Record<Channel, number> {
  return { dtc: 0, dealer: 0, commercial: 0 }
}

export { weekStartOf }
