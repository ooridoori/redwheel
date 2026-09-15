/**
 * Part 1's entry point: `npm run build:data`.
 *
 * Reads the nine files exactly as Redwheel sent them and writes two artefacts:
 *
 *   data/master.json           the full consolidated record, for inspection
 *   data/planning-inputs.json  the compact projection the app and engine load
 *
 * Redwheel dropped these as CSVs in a shared folder; in a real deployment they
 * would be live database connections. Keeping all file reading in this one
 * script means swapping CSVs for queries touches nothing else.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMasterData, type SourceFiles } from '../lib/normalize'
import { derivePlanningInputs } from '../lib/planning-inputs'

const RAW = join(process.cwd(), 'data', 'raw')
const OUT = join(process.cwd(), 'data')

const FILENAMES: Record<keyof SourceFiles, string> = {
  dtcOrders: 'dtc_web_orders.csv',
  dealerOrders: 'dealer_orders_export.csv',
  commercialOrders: 'Commercial_PO_Log.csv',
  plantStock: 'plant_inventory_snapshot.csv',
  dealerStock: 'dealer_stock_report.csv',
  capacity: 'capacity_plan.csv',
  forecastDtc: 'forecast_dtc.csv',
  forecastDealer: 'forecast_dealer.csv',
  forecastCommercial: 'forecast_commercial.csv',
}

function readSourceFiles(): SourceFiles {
  const entries = Object.entries(FILENAMES) as [keyof SourceFiles, string][]
  const files = {} as SourceFiles
  for (const [key, filename] of entries) {
    files[key] = readFileSync(join(RAW, filename), 'utf8')
  }
  return files
}

const master = buildMasterData(readSourceFiles())
const inputs = derivePlanningInputs(master)

writeFileSync(join(OUT, 'master.json'), JSON.stringify(master, null, 2))
writeFileSync(join(OUT, 'planning-inputs.json'), JSON.stringify(inputs))

const sizeOf = (path: string) => `${Math.round(readFileSync(path).byteLength / 1024).toLocaleString()} KB`

console.log('Master data built.\n')
console.log(`  snapshot date       ${master.asOf}`)
console.log(`  products            ${master.products.length}`)
console.log(`  order lines         ${master.orders.length.toLocaleString()}`)
console.log(`  stock positions     ${master.stock.length.toLocaleString()}`)
console.log(`  capacity slots      ${master.capacity.length.toLocaleString()}`)
console.log(`  forecast points     ${master.forecast.length.toLocaleString()}`)
console.log(`  plan weeks          ${inputs.planWeeks.length} (${inputs.planWeeks[0]} to ${inputs.planWeeks.at(-1)})`)
console.log(`  forecast weeks      ${inputs.forecastWeeks.length} (to ${inputs.forecastWeeks.at(-1)})`)
console.log(`\n  master.json         ${sizeOf(join(OUT, 'master.json'))}`)
console.log(`  planning-inputs     ${sizeOf(join(OUT, 'planning-inputs.json'))}`)

console.log('\nOpening position by SKU (Redwheel-held stock, backlog, net):\n')
console.log('  SKU        line          on hand   backlog       net')
for (const product of master.products) {
  const onHand = inputs.openingStock[product.sku]
  const backlog = inputs.backlog[product.sku]
  const net = onHand - backlog
  console.log(
    `  ${product.sku}  ${product.line.padEnd(12)}  ${String(onHand).padStart(7)}  ${String(backlog).padStart(7)}  ${String(net).padStart(8)}`,
  )
}

console.log('\nData notes:\n')
for (const note of master.notes) {
  console.log(`  [${note.severity === 'warning' ? 'JUDGEMENT' : 'observed '}] ${note.source}`)
  console.log(`              ${note.message}\n`)
}
