/**
 * Runs the allocation engine against Redwheel's real data and prints the
 * headlines: `npm run plan`.
 *
 * The UI is the real deliverable for Part 3, but having a terminal version
 * makes the engine's answer checkable without a browser, and makes it obvious
 * that the UI is only rendering the engine rather than doing arithmetic of
 * its own.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LINE_LABELS, LINES } from '../lib/domain'
import type { PlanningInputs } from '../lib/planning-inputs'
import { runAllocation } from '../lib/engine'
import { DEFAULT_POLICY, RATIONING_LABELS, type RationingRule } from '../lib/engine/policy'
import { DEALER_TREATMENT_LABELS } from '../lib/engine/dealer-buffer'

const inputs = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'planning-inputs.json'), 'utf8'),
) as PlanningInputs

const weeks = (value: number) => `${value >= 0 ? '' : '\u2212'}${Math.abs(value).toFixed(1)}w`
const units = (value: number) => Math.round(value).toLocaleString()
const percent = (value: number) => `${(value * 100).toFixed(1)}%`

const plan = runAllocation(inputs, DEFAULT_POLICY)

console.log(`\nRedwheel build plan  ${plan.weeks[0]} to ${plan.weeks.at(-1)}  (${plan.weeks.length} weeks)`)
console.log(`Rationing rule: ${RATIONING_LABELS[DEFAULT_POLICY.rationing]}\n`)

console.log('  line             target   start     end   at target from   weeks ok   built / capacity   util    backlog cleared   unmet')
for (const kpi of plan.kpis.lines) {
  console.log(
    [
      `  ${LINE_LABELS[kpi.line].padEnd(16)}`,
      `${String(kpi.targetWeeks).padStart(5)}w`,
      weeks(kpi.coverageAtStart).padStart(8),
      weeks(kpi.coverageAtEnd).padStart(7),
      (kpi.firstWeekAtTarget ?? 'never').padStart(15),
      `${String(kpi.weeksAtOrAboveTarget).padStart(6)}/${plan.weeks.length}`,
      `${units(kpi.totalBuild).padStart(9)} / ${units(kpi.totalCapacity).padStart(7)}`,
      percent(kpi.utilization).padStart(7),
      (kpi.backlogClearedWeek ?? 'never').padStart(18),
      units(kpi.unmetDemand).padStart(8),
    ].join(' '),
  )
}

console.log(`\n  Total built            ${units(plan.kpis.totalBuild)} of ${units(plan.kpis.totalCapacity)} available (${percent(plan.kpis.utilization)})`)
console.log(`  Backlog                ${units(plan.kpis.backlogAtStart)} at start, ${units(plan.kpis.backlogAtEnd)} at end`)
console.log(`  All backlog cleared    ${plan.kpis.backlogClearedWeek ?? 'never'}`)
console.log(`  Lines at target by end ${plan.kpis.linesAtTargetAtEnd} of ${plan.kpis.lines.length}`)

console.log('\nThe mix problem, first week of the plan:\n')
console.log('  SKU        line          on hand   backlog   cover   target   asked   built')
for (const row of plan.rows.filter((entry) => entry.weekStart === plan.weeks[0] && entry.line.startsWith('mtb'))) {
  console.log(
    [
      `  ${row.sku}`,
      row.line.padEnd(12),
      units(row.startingInventory).padStart(8),
      units(row.startingBacklog).padStart(9),
      weeks(row.startingCoverage).padStart(7),
      `${String(row.targetWeeks).padStart(6)}w`,
      units(row.desiredBuild).padStart(7),
      units(row.build).padStart(7),
    ].join(' '),
  )
}

console.log('\nDealer floor stock absorbing dealer-channel demand:\n')
console.log('  SKU        on dealer floors   absorbed   weeks covered   runs dry')
for (const entry of plan.dealerBuffer.absorption) {
  console.log(
    [
      `  ${entry.sku}`,
      units(entry.openingDealerStock).padStart(17),
      units(entry.unitsAbsorbed).padStart(10),
      entry.weeksCovered.toFixed(1).padStart(14),
      (entry.exhaustedWeek ?? 'never').padStart(12),
    ].join(' '),
  )
}
console.log(`\n  Total absorbed by dealer stock: ${units(plan.dealerBuffer.totalAbsorbed)} units never built`)

console.log('\nSame plan under each dealer stock treatment:\n')
console.log('  treatment                       built   util   lines at target   backlog cleared')
for (const treatment of ['channel-segregated', 'exclude', 'central'] as const) {
  const alternative = runAllocation(inputs, { ...DEFAULT_POLICY, dealerStock: treatment })
  console.log(
    [
      `  ${DEALER_TREATMENT_LABELS[treatment].padEnd(28)}`,
      units(alternative.kpis.totalBuild).padStart(7),
      percent(alternative.kpis.utilization).padStart(6),
      `${String(alternative.kpis.linesAtTargetAtEnd).padStart(14)}/4`,
      (alternative.kpis.backlogClearedWeek ?? 'never').padStart(17),
    ].join(' '),
  )
}

console.log('\nSame plan under each rationing rule:\n')
console.log('  rule                  built   util    all backlog cleared   lines at target   unmet')
for (const rule of Object.keys(RATIONING_LABELS) as RationingRule[]) {
  const alternative = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: rule })
  const unmet = alternative.kpis.lines.reduce((total, line) => total + line.unmetDemand, 0)
  console.log(
    [
      `  ${RATIONING_LABELS[rule].padEnd(20)}`,
      units(alternative.kpis.totalBuild).padStart(7),
      percent(alternative.kpis.utilization).padStart(7),
      (alternative.kpis.backlogClearedWeek ?? 'never').padStart(21),
      `${String(alternative.kpis.linesAtTargetAtEnd).padStart(14)}/4`,
      units(unmet).padStart(8),
    ].join(' '),
  )
}

console.log()
