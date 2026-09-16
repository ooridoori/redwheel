/**
 * Every decision the engine makes that Redwheel could reasonably disagree with.
 *
 * Pulling these out of the algorithm means the plan can be re-run under
 * different assumptions during a client call, and means "why is this number
 * what it is" always has an answer that points at a policy rather than at code.
 */
import type { LineId } from '../domain'
import { DEALER_SCENARIO_LABELS, type DealerStockTreatment } from './dealer-buffer'

/**
 * How to divide a line's weekly units when the SKUs on it want more than there
 * is. Every rule ranks and allocates at SKU level, because a line's shortage is
 * never evenly spread across its sizes.
 *
 * - `worst-first` serves whoever is furthest below target until they catch up.
 *   Fixes the sharpest shortage soonest; others wait.
 * - `proportional` gives everyone the same fraction of what they asked for.
 *   Nobody is starved, nobody is fixed quickly.
 * - `backlog-first` clears units already owed to customers before building any
 *   buffer. Best for people waiting today, slowest to reach target cover.
 *
 * Forecast mix — each SKU's share of its line's forecast demand — is only a
 * tie-breaker. Using it as the primary split would contradict `worst-first`
 * entirely: a size comfortably at 10 weeks of cover would keep taking its
 * forecast share while its starving sibling waited.
 */
export type RationingRule = 'worst-first' | 'proportional' | 'backlog-first'

/** A weeks-of-supply target that applies from `from` until the next rule starts. */
export interface TargetRule {
  from: string
  weeks: number
}

export interface Policy {
  /** Target weeks of cover per line, in ascending date order. */
  targets: Record<LineId, TargetRule[]>
  rationing: RationingRule
  /** What the units sitting in dealer shops are allowed to do. See `dealer-buffer.ts`. */
  dealerStock: DealerStockTreatment
}

/**
 * The targets exactly as the brief states them.
 *
 * The brief says "road bikes" without distinguishing base from carbon, so both
 * road lines get the same rule. That is an inference, and a deliberate one.
 */
export const DEFAULT_POLICY: Policy = {
  targets: {
    'road-base': [
      { from: '2026-01-01', weeks: 8 },
      { from: '2028-01-01', weeks: 10 },
    ],
    'road-carbon': [
      { from: '2026-01-01', weeks: 8 },
      { from: '2028-01-01', weeks: 10 },
    ],
    'mtb-base': [{ from: '2026-01-01', weeks: 12 }],
    'mtb-carbon': [{ from: '2026-01-01', weeks: 15 }],
  },
  rationing: 'worst-first',
  dealerStock: 'channel-segregated',
}

export const RATIONING_LABELS: Record<RationingRule, string> = {
  'worst-first': 'Worst-off first',
  proportional: 'Proportional to need',
  'backlog-first': 'Owed customers first',
}

export const RATIONING_DESCRIPTIONS: Record<RationingRule, string> = {
  'worst-first': 'Capacity goes first to the SKU furthest below its target cover.',
  proportional: 'Each SKU receives the same fraction of its required build.',
  'backlog-first': 'Capacity prioritizes existing backlog before rebuilding forward cover.',
}

export const ALLOCATION_BADGE_LABELS: Record<RationingRule, string> = {
  'worst-first': 'Prioritized — furthest below target',
  proportional: 'Allocated proportionally to required build',
  'backlog-first': 'Prioritized to serve existing backlog',
}

export const ALLOCATION_PEER_CAPTIONS: Record<RationingRule, string> = {
  'worst-first': 'furthest below target first',
  proportional: 'split in proportion to required build',
  'backlog-first': 'existing backlog first',
}

/** True when target-cover rules still match the brief, regardless of rationing or dealer treatment. */
export function usesBriefTargets(policy: Policy): boolean {
  return JSON.stringify(policy.targets) === JSON.stringify(DEFAULT_POLICY.targets)
}

/** Compact line for the always-visible scenario summary. Driven by the applied policy. */
export function scenarioSummary(policy: Policy): string {
  const targets = usesBriefTargets(policy) ? 'Brief cover targets' : 'Custom cover targets'
  return `${RATIONING_LABELS[policy.rationing]} \u00b7 ${DEALER_SCENARIO_LABELS[policy.dealerStock]} \u00b7 ${targets}`
}

/** The target in force for a line in a given week. */
export function targetWeeksFor(policy: Policy, line: LineId, weekStart: string): number {
  const rules = policy.targets[line]
  let active = rules[0]
  for (const rule of rules) {
    if (rule.from <= weekStart) active = rule
  }
  return active.weeks
}
