/**
 * Turns one plan row back into the arithmetic that produced it.
 *
 * Part 3 has to show clients the math, so the math is spelled out here rather
 * than assembled inside a component. It is derived purely from the row, which
 * means the explanation cannot drift away from the number it explains.
 */
import { LINE_LABELS } from '../domain'
import type { LineWeek, PlanRow } from './index'
import { RATIONING_LABELS, type RationingRule } from './policy'

export interface DerivationStep {
  label: string
  value: number
  /** How this line combines with the running total above it. */
  operator: '+' | '\u2212' | '=' | ''
  note?: string
  emphasis?: boolean
}

export interface Derivation {
  /** Why this SKU asked for the units it asked for. */
  need: DerivationStep[]
  /** Why it received what it received. */
  allocation: DerivationStep[]
  /** Where the week left it. */
  outcome: DerivationStep[]
  /** True when the line could not build everything its SKUs asked for. */
  wasRationed: boolean
}

export function derivationOf(row: PlanRow, lineWeek: LineWeek, rule: RationingRule): Derivation {
  const wasRationed = lineWeek.desiredBuild > lineWeek.capacity

  const need: DerivationStep[] = [
    {
      label: `Demand over the next ${row.targetWeeks} weeks`,
      value: row.targetInventory,
      operator: '',
      note: `Target cover for ${LINE_LABELS[row.line]} is ${row.targetWeeks} weeks`,
    },
    {
      label: 'Units already owed to customers',
      value: row.startingBacklog,
      operator: '+',
      note: row.startingBacklog > 0 ? 'Backlog is netted out, so it has to be rebuilt too' : undefined,
    },
    { label: "This week's demand", value: row.forecast, operator: '+' },
    { label: 'Stock already on hand', value: row.startingInventory, operator: '\u2212' },
    { label: 'Units needed', value: row.desiredBuild, operator: '=', emphasis: true },
  ]

  const allocation: DerivationStep[] = [
    { label: 'Units needed', value: row.desiredBuild, operator: '' },
    {
      label: `Line capacity this week`,
      value: lineWeek.capacity,
      operator: '',
      note: `Shared across every size on ${LINE_LABELS[row.line]}`,
    },
    {
      label: 'Asked for by the whole line',
      value: lineWeek.desiredBuild,
      operator: '',
      note: wasRationed
        ? `Over capacity by ${(lineWeek.desiredBuild - lineWeek.capacity).toLocaleString()} units, so ${RATIONING_LABELS[rule].toLowerCase()} decided the split`
        : 'Within capacity, so every size got what it asked for',
    },
    { label: 'Units built', value: row.build, operator: '=', emphasis: true },
  ]

  const outcome: DerivationStep[] = [
    { label: 'Stock at week start', value: row.startingInventory, operator: '' },
    { label: 'Units built', value: row.build, operator: '+' },
    {
      label: 'Units shipped',
      value: row.shipped,
      operator: '\u2212',
      note: 'Backlog is cleared before new demand',
    },
    { label: 'Stock at week end', value: row.endingInventory, operator: '=', emphasis: true },
  ]

  return { need, allocation, outcome, wasRationed }
}
