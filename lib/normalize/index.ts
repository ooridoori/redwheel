/**
 * Part 1: consolidate the nine source files into one `MasterData` value.
 *
 * This module takes raw file text rather than paths so it stays pure and can
 * be tested without a filesystem. Reading files is the build script's job.
 *
 * Beyond translating, this step *audits*. Redwheel dropped these files in a
 * folder with no explanation, so anything we had to infer is recorded as a
 * `DataNote` and surfaced in the UI instead of living only in our heads.
 */
import type { DataNote, LineId, MasterData, Product } from '../domain'
import { LINES, lineOf } from '../domain'
import { readCommercialOrders, readDealerOrders, readDtcOrders, type ObservedProduct } from './orders'
import { readDealerStock, readPlantStock } from './stock'
import { readCapacity, readForecast } from './supply'

export interface SourceFiles {
  dtcOrders: string
  dealerOrders: string
  commercialOrders: string
  plantStock: string
  dealerStock: string
  capacity: string
  forecastDtc: string
  forecastDealer: string
  forecastCommercial: string
}

export function buildMasterData(files: SourceFiles): MasterData {
  const notes: DataNote[] = []

  const dtc = readDtcOrders(files.dtcOrders)
  const dealer = readDealerOrders(files.dealerOrders)
  const commercial = readCommercialOrders(files.commercialOrders)
  const orders = [...dtc.orders, ...dealer.orders, ...commercial.orders]

  const plantStock = readPlantStock(files.plantStock)
  const dealerStock = readDealerStock(files.dealerStock)
  const stock = [...plantStock, ...dealerStock]

  const capacity = readCapacity(files.capacity)
  const forecast = [
    ...readForecast(files.forecastDtc, 'dtc', 'forecast_dtc.csv'),
    ...readForecast(files.forecastDealer, 'dealer', 'forecast_dealer.csv'),
    ...readForecast(files.forecastCommercial, 'commercial', 'forecast_commercial.csv'),
  ]

  const products = resolveProducts([...dtc.observed, ...dealer.observed, ...commercial.observed], notes)

  notes.push(...describeTranslation())
  notes.push(...auditStock(plantStock, dealerStock))
  notes.push(...auditBacklog(orders))
  notes.push(...auditCapacity(capacity))
  notes.push(...auditHorizons(capacity, forecast))
  notes.push(...auditCoverage(products, forecast, plantStock, capacity))

  return {
    asOf: resolveAsOf(plantStock),
    products,
    orders,
    stock,
    capacity,
    forecast,
    notes,
  }
}

/**
 * Builds the product catalog from what the order files claim, and checks the
 * three files against each other.
 *
 * No file is designated the product master, so agreement between them is the
 * only evidence we have that a SKU means one thing.
 */
function resolveProducts(observed: ObservedProduct[], notes: DataNote[]): Product[] {
  const bySku = new Map<string, ObservedProduct[]>()
  for (const item of observed) {
    const existing = bySku.get(item.sku)
    if (existing) existing.push(item)
    else bySku.set(item.sku, [item])
  }

  const products: Product[] = []
  const conflicts: string[] = []

  for (const [sku, claims] of [...bySku.entries()].sort()) {
    const distinct = new Set(claims.map((claim) => `${claim.class}/${claim.trim}/${claim.size}`))
    if (distinct.size > 1) {
      conflicts.push(`${sku} (${[...distinct].join(' vs ')})`)
    }
    const [first] = claims
    products.push({
      sku,
      class: first.class,
      trim: first.trim,
      size: first.size,
      line: lineOf(first.class, first.trim),
    })
  }

  notes.push(
    conflicts.length === 0
      ? {
          severity: 'info',
          source: 'all three order files',
          message: `All ${products.length} SKUs describe the same class, trim and size in every file they appear in, so the derived product catalogue is unambiguous.`,
        }
      : {
          severity: 'warning',
          source: 'all three order files',
          message: `SKUs described inconsistently across files: ${conflicts.join('; ')}. Resolved by taking the first file's claim — Redwheel should confirm.`,
        },
  )

  return products
}

/** The plant snapshot date anchors week one of the plan. */
function resolveAsOf(plantStock: ReturnType<typeof readPlantStock>): string {
  const dates = [...new Set(plantStock.map((position) => position.asOf))]
  return dates.sort()[dates.length - 1]
}

function describeTranslation(): DataNote[] {
  return [
    {
      severity: 'info',
      source: 'three order files',
      message:
        'Three date formats were reconciled to ISO: DTC uses 2025-09-08, dealer uses 09/08/2025 (month first), commercial uses 10-Sep-2025.',
    },
    {
      severity: 'info',
      source: 'Commercial_PO_Log.csv',
      message:
        'Commercial POs name the same fields differently: Product is the SKU, Length is the size, Material is the trim, Need By is the requested date, Delivered is the ship date.',
    },
    {
      severity: 'warning',
      source: 'assumption',
      message:
        'Dealer-held inventory has already been wholesaled and is not Redwheel available stock. It does not offset forecast or production requirements. Dealer-channel forecast still counts as demand the plant must serve.',
    },
    {
      severity: 'warning',
      source: 'assumption',
      message:
        'Capacity and cover targets are stated per production line, but stock, backlog and forecast are per SKU. Builds are ranked and allocated at SKU level. The default policy is worst-off first by weeks below target, with forecast mix only breaking ties; proportional and owed-customers-first are selectable alternatives.',
    },
  ]
}

function auditStock(
  plantStock: ReturnType<typeof readPlantStock>,
  dealerStock: ReturnType<typeof readDealerStock>,
): DataNote[] {
  const notes: DataNote[] = []

  const countDates = [...new Set(dealerStock.map((position) => position.asOf))].sort()
  if (countDates.length > 1) {
    notes.push({
      severity: 'warning',
      source: 'dealer_stock_report.csv',
      message: `Dealer counts were taken on ${countDates.length} different days (${countDates[0]} to ${countDates[countDates.length - 1]}), so this is a self-reported roll-up rather than a synchronized snapshot.`,
    })
  }

  const plantTotal = plantStock.reduce((total, position) => total + position.onHand, 0)
  const dealerTotal = dealerStock.reduce((total, position) => total + position.onHand, 0)
  notes.push({
    severity: 'info',
    source: 'both inventory files',
    message: `${plantTotal.toLocaleString()} units are in Redwheel\u2019s plant and DC; a further ${dealerTotal.toLocaleString()} sit with dealers.`,
  })

  return notes
}

function auditBacklog(orders: MasterData['orders']): DataNote[] {
  const unfulfilled = orders.filter((order) => !order.isFulfilled)
  const units = unfulfilled.reduce((total, order) => total + order.qty, 0)
  const mismatched = orders.filter((order) => order.isFulfilled === (order.shipDate === null))

  const notes: DataNote[] = [
    {
      severity: 'info',
      source: 'three order files',
      message: `${units.toLocaleString()} units across ${unfulfilled.length.toLocaleString()} order lines are unfulfilled as at the snapshot. These are treated as backlog and netted out of the supply position.`,
    },
  ]

  if (mismatched.length > 0) {
    notes.push({
      severity: 'warning',
      source: 'three order files',
      message: `${mismatched.length} order lines disagree with themselves: the fulfilment flag and the presence of a ship date do not match.`,
    })
  }

  return notes
}

function auditCapacity(capacity: MasterData['capacity']): DataNote[] {
  const changing: string[] = []
  for (const line of LINES) {
    const units = capacity.filter((slot) => slot.line === line).map((slot) => slot.units)
    if (units.length === 0) continue
    const min = Math.min(...units)
    const max = Math.max(...units)
    if (min !== max) changing.push(`${line} ${min}\u2013${max}`)
  }

  if (changing.length === 0) return []

  return [
    {
      severity: 'info',
      source: 'capacity_plan.csv',
      message: `Capacity is not flat — weekly ceilings change over the horizon (${changing.join(', ')} units/week). The plan has to respect the ceiling in each individual week.`,
    },
  ]
}

function auditHorizons(
  capacity: MasterData['capacity'],
  forecast: MasterData['forecast'],
): DataNote[] {
  const lastCapacityWeek = capacity.map((slot) => slot.weekStart).sort().at(-1)
  const lastForecastWeek = forecast.map((point) => point.weekStart).sort().at(-1)
  if (!lastCapacityWeek || !lastForecastWeek || lastForecastWeek <= lastCapacityWeek) return []

  return [
    {
      severity: 'info',
      source: 'capacity_plan.csv, forecast files',
      message: `Forecasts run to ${lastForecastWeek} but capacity stops at ${lastCapacityWeek}. The build plan therefore ends with capacity, and the extra forecast is used to measure weeks of supply for the final weeks — without it, the tail of the plan has no forward demand to measure against.`,
    },
  ]
}

/** Referential integrity: every SKU and line referenced anywhere must exist in the catalogue. */
function auditCoverage(
  products: Product[],
  forecast: MasterData['forecast'],
  plantStock: ReturnType<typeof readPlantStock>,
  capacity: MasterData['capacity'],
): DataNote[] {
  const notes: DataNote[] = []
  const known = new Set(products.map((product) => product.sku))

  const unknownForecast = [...new Set(forecast.map((point) => point.sku))].filter((sku) => !known.has(sku))
  const unknownStock = [...new Set(plantStock.map((position) => position.sku))].filter((sku) => !known.has(sku))
  const missingForecast = [...known].filter((sku) => !forecast.some((point) => point.sku === sku))
  const missingStock = [...known].filter((sku) => !plantStock.some((position) => position.sku === sku))

  for (const [label, skus] of [
    ['forecast files', unknownForecast],
    ['plant_inventory_snapshot.csv', unknownStock],
  ] as const) {
    if (skus.length > 0) {
      notes.push({
        severity: 'warning',
        source: label,
        message: `References SKUs that appear in no order file: ${skus.join(', ')}.`,
      })
    }
  }

  if (missingForecast.length > 0) {
    notes.push({
      severity: 'warning',
      source: 'forecast files',
      message: `No forecast for ${missingForecast.join(', ')}, so no target can be computed for them.`,
    })
  }
  if (missingStock.length > 0) {
    notes.push({
      severity: 'warning',
      source: 'plant_inventory_snapshot.csv',
      message: `No opening stock row for ${missingStock.join(', ')}; treated as zero on hand.`,
    })
  }

  const linesWithCapacity = new Set<LineId>(capacity.map((slot) => slot.line))
  const linesNeeded = new Set<LineId>(products.map((product) => product.line))
  const uncapped = [...linesNeeded].filter((line) => !linesWithCapacity.has(line))
  if (uncapped.length > 0) {
    notes.push({
      severity: 'warning',
      source: 'capacity_plan.csv',
      message: `No capacity rows for ${uncapped.join(', ')}, so nothing can be built on those lines.`,
    })
  }

  if (notes.length === 0) {
    notes.push({
      severity: 'info',
      source: 'all nine files',
      message: 'Every SKU referenced by forecasts and inventory exists in the product catalogue, and every line in use has capacity. No orphan records.',
    })
  }

  return notes
}
