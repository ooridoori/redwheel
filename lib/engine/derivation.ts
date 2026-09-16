/**
 * Turns one plan row into the arithmetic the explainability drawer shows.
 *
 * Purely derived from the row and its line-week peers — never recomputes the
 * engine. That keeps the drawer locked to the number on screen.
 */
import type { PlanRow, LineWeek } from './index'

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
  targetWeeks: number
  /** Weeks below (negative) or above (positive) target at week start. */
  gap: number
  desiredBuild: number
  build: number
  startingBacklog: number
  forecast: number
  isSelected: boolean
  /** Furthest below target when ranking by worst-off-first urgency. */
  prioritized: boolean
}

export interface Derivation {
  need: EquationTerm[]
  /** Backlog + current plant demand that roll up into Current obligations. */
  needAgainst: EquationTerm[]
  capacity: EquationTerm[]
  outcome: EquationTerm[]
  /** Obligations that shipped draws against: backlog + current plant demand. */
  shippedAgainst: EquationTerm[]
  capacityConstrained: boolean
  peers: PeerStanding[]
  endingBacklog: number
  absorbedByDealers: number
  grossForecast: number
  forecast: number
}

/**
 * Peers on the same line and week, ordered the way worst-off-first would rank
 * them: furthest below target first. Used to explain who got capacity.
 */
export function peersOnLine(selected: PlanRow, lineRows: PlanRow[]): PeerStanding[] {
  const peers = lineRows
    .filter((row) => row.weekStart === selected.weekStart && row.line === selected.line)
    .map((row) => ({
      sku: row.sku,
      size: row.size,
      startingCoverage: row.startingCoverage,
      targetWeeks: row.targetWeeks,
      gap: row.startingCoverage - row.targetWeeks,
      desiredBuild: row.desiredBuild,
      build: row.build,
      startingBacklog: row.startingBacklog,
      forecast: row.forecast,
      isSelected: row.sku === selected.sku,
      prioritized: false,
    }))
    .sort((a, b) => {
      const gap = a.gap - b.gap
      if (Math.abs(gap) > 1e-9) return gap
      return b.forecast - a.forecast
    })

  if (peers.length > 0) peers[0].prioritized = true
  return peers
}

export function derivationOf(row: PlanRow, lineWeek: LineWeek, lineRows: PlanRow[]): Derivation {
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
      note:
        row.absorbedByDealers > 0
          ? `${row.absorbedByDealers.toLocaleString()} of ${row.grossForecast.toLocaleString()} covered by dealer stock`
          : undefined,
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

  const shortfall = Math.max(0, lineWeek.desiredBuild - lineWeek.capacity)
  const capacity: EquationTerm[] = [
    {
      label: 'This SKU needs',
      value: row.desiredBuild,
      operator: '',
      role: 'obligation',
    },
    {
      label: 'Combined SKU need',
      value: lineWeek.desiredBuild,
      operator: '',
      role: 'obligation',
    },
    {
      label: 'Line capacity',
      value: lineWeek.capacity,
      operator: '',
      role: 'supply',
    },
    {
      label: 'Capacity shortfall',
      value: shortfall,
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
    outcome,
    shippedAgainst,
    capacityConstrained,
    peers: peersOnLine(row, lineRows),
    endingBacklog: row.endingBacklog,
    absorbedByDealers: row.absorbedByDealers,
    grossForecast: row.grossForecast,
    forecast: row.forecast,
  }
}
