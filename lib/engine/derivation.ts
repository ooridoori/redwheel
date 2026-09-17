/**
 * Turns one plan row into the arithmetic the explainability drawer shows.
 *
 * Purely derived from the row and its line-week peers — never recomputes the
 * engine. That keeps the drawer locked to the number on screen.
 */
import type { PlanRow, LineWeek } from './index'
import type { RationingRule } from './policy'

export type TermRole = 'obligation' | 'supply' | 'result' | 'neutral'

export interface EquationTerm {
  label: string
  value: number
  operator: '+' | '\u2212' | '=' | ''
  role: TermRole
  note?: string
}

export interface PeerStanding {
  sku: string
  size: PlanRow['size']
  startingCoverage: number
  endingCoverage: number
  targetWeeks: number
  /** Weeks below (negative) or above (positive) target at week start. */
  gap: number
  desiredBuild: number
  build: number
  startingBacklog: number
  endingBacklog: number
  forecast: number
  isSelected: boolean
  /** First SKU the active rationing rule would serve on this constrained line-week. */
  prioritized: boolean
}

export interface Derivation {
  need: EquationTerm[]
  /** Backlog + current plant demand that roll up into Current obligations. */
  needAgainst: EquationTerm[]
  capacity: EquationTerm[]
  /** Line-week need vs capacity, including the total-required denominator. */
  lineNeed: LineNeed
  outcome: EquationTerm[]
  /** Obligations that shipped draws against: backlog + current plant demand. */
  shippedAgainst: EquationTerm[]
  capacityConstrained: boolean
  peers: PeerStanding[]
  endingBacklog: number
  forecast: number
}

/** How much of this week's line need the available capacity can cover. */
export interface LineNeed {
  thisNeed: number
  otherNeed: number
  otherCount: number
  totalRequired: number
  capacity: number
  unmet: number
  /** capacity / totalRequired. Zero when nothing is required. */
  coverage: number
}

export function lineNeedOf(row: PlanRow, lineWeek: LineWeek, lineRows: PlanRow[]): LineNeed {
  const others = lineRows.filter(
    (candidate) =>
      candidate.weekStart === row.weekStart &&
      candidate.line === row.line &&
      candidate.sku !== row.sku,
  )
  const totalRequired = lineWeek.desiredBuild
  return {
    thisNeed: row.desiredBuild,
    otherNeed: totalRequired - row.desiredBuild,
    otherCount: others.length,
    totalRequired,
    capacity: lineWeek.capacity,
    unmet: lineWeek.unmet,
    coverage: totalRequired > 0 ? lineWeek.capacity / totalRequired : 0,
  }
}

/**
 * SKU on a constrained line that worst-off-first would serve first: furthest
 * below its target on starting cover, among SKUs that still need a build.
 */
export function worstFirstWinnerSku(lineRows: PlanRow[]): string | null {
  const needing = lineRows.filter((row) => row.desiredBuild > 0)
  if (needing.length === 0) return null
  const ranked = [...needing].sort((a, b) => {
    const gap =
      a.startingCoverage - a.targetWeeks - (b.startingCoverage - b.targetWeeks)
    if (Math.abs(gap) > 1e-9) return gap
    return b.forecast - a.forecast
  })
  return ranked[0].sku
}

/**
 * First SKU backlog-first would serve. Matches ration()'s opening pass: sort by
 * starting backlog descending, grant min(required build, units owed). SKUs with
 * no opening backlog are skipped in that pass.
 */
export function backlogFirstWinnerSku(lineRows: PlanRow[]): string | null {
  const eligible = lineRows.filter((row) => row.desiredBuild > 0 && row.startingBacklog > 0)
  if (eligible.length === 0) return null
  const ranked = [...eligible].sort((a, b) => b.startingBacklog - a.startingBacklog)
  return ranked[0].sku
}

/** First SKU the active rule would serve. Proportional has no single winner. */
export function prioritizedSku(lineRows: PlanRow[], rule: RationingRule): string | null {
  if (rule === 'proportional') return null
  if (rule === 'backlog-first') return backlogFirstWinnerSku(lineRows)
  return worstFirstWinnerSku(lineRows)
}

/**
 * Peers on the same line and week, ordered the way worst-off-first would rank
 * them: furthest below target first. Used to explain who got capacity.
 */
export function peersOnLine(
  selected: PlanRow,
  lineRows: PlanRow[],
  rule: RationingRule = 'worst-first',
): PeerStanding[] {
  const weekLine = lineRows.filter((row) => row.weekStart === selected.weekStart && row.line === selected.line)
  const winner = prioritizedSku(weekLine, rule)
  const peers = weekLine
    .map((row) => ({
      sku: row.sku,
      size: row.size,
      startingCoverage: row.startingCoverage,
      endingCoverage: row.endingCoverage,
      targetWeeks: row.targetWeeks,
      gap: row.startingCoverage - row.targetWeeks,
      desiredBuild: row.desiredBuild,
      build: row.build,
      startingBacklog: row.startingBacklog,
      endingBacklog: row.endingBacklog,
      forecast: row.forecast,
      isSelected: row.sku === selected.sku,
      prioritized: row.sku === winner,
    }))
    .sort((a, b) => {
      const gap = a.gap - b.gap
      if (Math.abs(gap) > 1e-9) return gap
      return b.forecast - a.forecast
    })

  return peers
}

/** Reorder peers for display to match the active rationing rule. Ranking math stays in the engine. */
export function peersInPolicyOrder(peers: PeerStanding[], rule: RationingRule): PeerStanding[] {
  const copy = [...peers]
  if (rule === 'proportional') {
    return copy.sort((a, b) => b.desiredBuild - a.desiredBuild || a.sku.localeCompare(b.sku))
  }
  if (rule === 'backlog-first') {
    return copy.sort((a, b) => b.startingBacklog - a.startingBacklog || a.gap - b.gap)
  }
  return copy
}

export function derivationOf(
  row: PlanRow,
  lineWeek: LineWeek,
  lineRows: PlanRow[],
  rule: RationingRule = 'worst-first',
): Derivation {
  const capacityConstrained = lineWeek.desiredBuild > lineWeek.capacity
  const obligations = row.startingBacklog + row.forecast

  const need: EquationTerm[] = [
    {
      label: 'Target inventory',
      value: row.targetInventory,
      operator: '',
      role: 'obligation',
    },
    {
      label: 'Backlog',
      value: row.startingBacklog,
      operator: '+',
      role: 'obligation',
    },
    {
      label: 'Current plant demand',
      value: row.forecast,
      operator: '+',
      role: 'obligation',
      note: 'Includes dealer-channel forecast. Dealer-held inventory is not subtracted.',
    },
    {
      label: 'Starting inventory',
      value: row.startingInventory,
      operator: '\u2212',
      role: 'supply',
    },
    {
      label: 'Required build',
      value: row.desiredBuild,
      operator: '=',
      role: 'result',
    },
  ]

  const needAgainst: EquationTerm[] = [
    {
      label: 'Backlog',
      value: row.startingBacklog,
      operator: '',
      role: 'obligation',
    },
    {
      label: 'Current plant demand',
      value: row.forecast,
      operator: '+',
      role: 'obligation',
    },
  ]

  const lineNeed = lineNeedOf(row, lineWeek, lineRows)
  const capacity: EquationTerm[] = [
    {
      label: 'This SKU needs',
      value: lineNeed.thisNeed,
      operator: '',
      role: 'obligation',
    },
    {
      label: lineNeed.otherCount === 1 ? 'Other SKU need' : 'Other SKUs need',
      value: lineNeed.otherNeed,
      operator: '+',
      role: 'obligation',
    },
    {
      label: 'Total required build',
      value: lineNeed.totalRequired,
      operator: '=',
      role: 'result',
    },
    {
      label: 'Available line capacity',
      value: lineNeed.capacity,
      operator: '',
      role: 'supply',
    },
    {
      label: 'Unmet need',
      value: lineNeed.unmet,
      operator: '=',
      role: 'result',
      note: capacityConstrained ? undefined : 'Enough for every SKU',
    },
  ]

  const outcome: EquationTerm[] = [
    {
      label: 'Starting inventory',
      value: row.startingInventory,
      operator: '',
      role: 'supply',
    },
    {
      label: 'Planned build',
      value: row.build,
      operator: '+',
      role: 'supply',
    },
    {
      label: 'Shipped',
      value: row.shipped,
      operator: '\u2212',
      role: 'obligation',
      note: `Against ${obligations.toLocaleString()} obligations`,
    },
    {
      label: 'Ending inventory',
      value: row.endingInventory,
      operator: '=',
      role: 'result',
    },
  ]

  const shippedAgainst: EquationTerm[] = [
    {
      label: 'Backlog',
      value: row.startingBacklog,
      operator: '',
      role: 'obligation',
    },
    {
      label: 'Current plant demand',
      value: row.forecast,
      operator: '+',
      role: 'obligation',
    },
    {
      label: 'Obligations',
      value: obligations,
      operator: '=',
      role: 'result',
    },
  ]

  return {
    need,
    needAgainst,
    capacity,
    lineNeed,
    outcome,
    shippedAgainst,
    capacityConstrained,
    peers: peersOnLine(row, lineRows, rule),
    endingBacklog: row.endingBacklog,
    forecast: row.forecast,
  }
}
