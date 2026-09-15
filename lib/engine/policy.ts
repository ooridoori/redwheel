/**
 * Every decision the engine makes that Redwheel could reasonably disagree with.
 *
 * Pulling these out of the algorithm means the plan can be re-run under
 * different assumptions during a client call, and means "why is this number
 * what it is" always has an answer that points at a policy rather than at code.
 */
import type { LineId } from '../domain'

/**
 * How to divide a line's weekly units when every SKU on it wants more than
 * there is.
 *
 * - `worst-first` serves whoever is furthest below target until they catch up.
 *   Fixes the sharpest shortage soonest; others wait.
 * - `proportional` gives everyone the same fraction of what they asked for.
 *   Nobody is starved, nobody is fixed quickly.
 * - `backlog-first` clears units already owed to customers before building any
 *   buffer. Best for people waiting today, slowest to reach target cover.
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
  /**
   * Whether dealer-held stock counts toward Redwheel's supply position.
   *
   * Off by default: those units are already sold into bike shops and cannot be
   * reallocated, so counting them would overstate cover.
   */
  includeDealerStock: boolean
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
  includeDealerStock: false,
}

export const RATIONING_LABELS: Record<RationingRule, string> = {
  'worst-first': 'Worst-off first',
  proportional: 'Proportional to need',
  'backlog-first': 'Owed customers first',
}

export const RATIONING_DESCRIPTIONS: Record<RationingRule, string> = {
  'worst-first': 'Whoever is furthest below target is served until they catch up.',
  proportional: 'Every SKU receives the same fraction of what it asked for.',
  'backlog-first': 'Units already owed to customers are built before any buffer.',
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
