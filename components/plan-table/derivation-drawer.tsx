'use client'

/**
 * Why one planned-build number is what it is.
 *
 * Two narratives, both from engine fields only:
 *   requiredBuild > 0  → Need → Capacity constraint → Prioritization → Outcome
 *   requiredBuild = 0  → Need → Line context → Allocation → Outcome
 */
import { useState, type ReactNode } from 'react'
import { LINE_LABELS } from '@/lib/domain'
import { units, weekLabelLong, weeks, weeksPhrase } from '@/lib/format'
import {
  derivationOf,
  peersInPolicyOrder,
  type EquationTerm,
  type PeerStanding,
  type TermRole,
} from '@/lib/engine/derivation'
import {
  ALLOCATION_BADGE_LABELS,
  ALLOCATION_PEER_CAPTIONS,
  type RationingRule,
} from '@/lib/engine/policy'
import type { DealerStockTreatment } from '@/lib/engine/dealer-buffer'
import type { PlanRow } from '@/lib/engine'
import { Badge, Divider, cx } from '@/components/ui/primitives'
import { CheckIcon, ChevronDownIcon, CloseIcon } from '@/components/ui/icons'
import { coverGloss, skuStatus, wellAboveTarget } from '@/lib/engine/status'
import type { TableRow } from './rows'

export function DerivationDrawer({
  row,
  lineRows,
  rule,
  dealerStock,
  onClose,
  onSelectSku,
}: {
  row: TableRow
  lineRows: PlanRow[]
  rule: RationingRule
  dealerStock: DealerStockTreatment
  onClose: () => void
  onSelectSku: (sku: string) => void
}) {
  const { row: planRow, lineWeek } = row.detail
  const derivation = derivationOf(planRow, lineWeek, lineRows)
  const status = skuStatus(planRow)
  const needsBuild = planRow.desiredBuild > 0
  const others = derivation.peers.filter((peer) => !peer.isSelected)
  const needing = derivation.peers.filter((peer) => peer.desiredBuild > 0)
  const competing = needing.length >= 2
  const startGloss = coverGloss(planRow.startingCoverage, planRow.targetWeeks)
  const endGloss = coverGloss(planRow.endingCoverage, planRow.targetWeeks)

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col overflow-y-auto border-l border-edge bg-surface shadow-2xl lg:static lg:z-auto lg:w-[400px] lg:max-w-none lg:shrink-0 lg:shadow-none">
      <header className="sticky top-0 z-10 border-b border-edge bg-surface px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="eyebrow">{weekLabelLong(planRow.weekStart)}</div>
            <h2 className="mt-0.5 text-[15px] font-medium tnum">{planRow.sku}</h2>
            <div className="mt-0.5 text-[12px] text-ink-faint">
              {LINE_LABELS[planRow.line]} · size {planRow.size}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-hover hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={status.met ? 'positive' : 'warning'}>
            {status.met ? <CheckIcon /> : null}
            {status.label}
          </Badge>
          {status.detail && <span className="text-[11.5px] text-warn">{status.detail}</span>}
          {status.met && wellAboveTarget(planRow.endingCoverage, planRow.targetWeeks) && (
            <span className="text-[11.5px] text-pos">Well above target</span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Stat label="Target cover" value={weeksPhrase(planRow.targetWeeks, 1)} />
          <Stat
            label="Projected cover"
            value={weeksPhrase(planRow.endingCoverage)}
            tone={status.met ? 'pos' : 'warn'}
            hint={endGloss}
          />
          <Stat label="Required build" value={units(planRow.desiredBuild)} />
          <Stat
            label="Allocated build"
            value={units(planRow.build)}
            tone={needsBuild && planRow.build < planRow.desiredBuild ? 'warn' : 'ink'}
          />
        </dl>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <section>
          <Question n={1} title="How much does this SKU need?" />
          <NeedCopy row={planRow} startGloss={startGloss} />
          <p className="mt-2 text-[12.5px] font-medium text-ink">
            Required build: {units(planRow.desiredBuild)} units
          </p>
          <Expandable label="How that number is calculated">
            <Equation terms={annotateNeed(derivation.need, dealerStock)} compact />
          </Expandable>
        </section>

        <Divider />

        <section>
          <Question
            n={2}
            title={
              needsBuild
                ? 'What is happening on this production line?'
                : 'What is happening on this SKU’s production line?'
            }
          />
          <LineContextCopy
            selected={planRow}
            others={others}
            lineCapacity={lineWeek.capacity}
            lineUnmet={lineWeek.unmet}
            constrained={derivation.capacityConstrained}
          />
          <div className="mt-2.5 rounded-lg border border-edge bg-raised/60 px-3 py-2.5">
            <Equation terms={derivation.capacity} compact />
          </div>
        </section>

        <Divider />

        <section>
          <Question n={3} title="Who gets the available capacity, and why?" />
          <AllocationCopy
            selected={planRow}
            others={others}
            needing={needing}
            competing={competing}
            constrained={derivation.capacityConstrained}
            rule={rule}
            lineCapacity={lineWeek.capacity}
          />
          <PeerList
            peers={peersInPolicyOrder(derivation.peers, rule)}
            competing={competing}
            rule={rule}
            onSelectSku={onSelectSku}
          />
        </section>

        <Divider />

        <section>
          <Question n={4} title="Where does this SKU end up?" />
          <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
            {planRow.sku} builds {units(planRow.build)} units and ships {units(planRow.shipped)} units.
          </p>
          <div className="mt-2.5 rounded-lg border border-edge px-3 py-2.5">
            <Equation
              terms={derivation.outcome.map((term) =>
                term.label === 'Shipped' ? { ...term, note: undefined } : term,
              )}
              compact
            />
          </div>
          <p className="mt-3 text-[12.5px] font-medium text-ink">
            {status.met ? 'Target remains met' : status.label}
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-muted">
            {planRow.sku} ends at {weeksPhrase(planRow.endingCoverage)} of cover against its{' '}
            {planRow.targetWeeks}-week target
            {endGloss ? ` \u2014 well above the ${planRow.targetWeeks}-week target` : ''}.
            {!status.met && status.detail ? ` ${status.detail}.` : ''}
          </p>
          <EndingPosition
            key={`${planRow.sku}|${planRow.weekStart}`}
            shippedAgainst={derivation.shippedAgainst}
            endingBacklog={derivation.endingBacklog}
          />
        </section>
      </div>
    </aside>
  )
}

function NeedCopy({ row, startGloss }: { row: PlanRow; startGloss: string | null }) {
  if (row.desiredBuild === 0) {
    return (
      <>
        <p className="mt-2 text-[13px] font-medium leading-snug text-ink">
          {row.sku} already has enough inventory.
        </p>
        <p className="mt-1.5 text-[12.5px] leading-snug text-ink-muted">
          Its target is {row.targetWeeks} weeks of supply, and it begins this week with{' '}
          {weeksPhrase(row.startingCoverage)} of cover
          {startGloss ? ` \u2014 well above the ${row.targetWeeks}-week target` : ''}.
        </p>
      </>
    )
  }

  return (
    <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
      {row.sku} needs {units(row.desiredBuild)} units to finish at {weeksPhrase(row.targetWeeks, 1)} of
      cover. It begins this week with {weeksPhrase(row.startingCoverage)}
      {startGloss ? ` (${startGloss})` : ''}.
    </p>
  )
}

function LineContextCopy({
  selected,
  others,
  lineCapacity,
  lineUnmet,
  constrained,
}: {
  selected: PlanRow
  others: PeerStanding[]
  lineCapacity: number
  lineUnmet: number
  constrained: boolean
}) {
  const lineName = LINE_LABELS[selected.line]
  const otherNames = joinNames(others.map((peer) => peer.sku))

  if (others.length === 0) {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        {selected.sku} is the only size on {lineName} this week. The line can build{' '}
        {units(lineCapacity)} units.
      </p>
    )
  }

  const otherNeed = others.reduce((total, peer) => total + peer.desiredBuild, 0)

  return (
    <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug text-ink-muted">
      <p>
        {selected.sku} shares the {lineName} production line with {otherNames}.
      </p>
      <p>
        {selected.desiredBuild === 0 ? (
          <>
            {selected.sku} needs no additional build this week, while {otherNeedSentence(others)}.
          </>
        ) : (
          <>
            {selected.sku} needs {units(selected.desiredBuild)} units this week
            {others.length === 1
              ? `; ${others[0].sku} needs ${units(others[0].desiredBuild)}.`
              : `, and the other sizes need ${units(otherNeed)} combined.`}
          </>
        )}
      </p>
      <p>
        The line can only build {units(lineCapacity)} units this week
        {constrained ? `, leaving ${units(lineUnmet)} of need unmet.` : ', which covers every SKU.'}
      </p>
    </div>
  )
}

function AllocationCopy({
  selected,
  others,
  needing,
  competing,
  constrained,
  rule,
  lineCapacity,
}: {
  selected: PlanRow
  others: PeerStanding[]
  needing: PeerStanding[]
  competing: boolean
  constrained: boolean
  rule: RationingRule
  lineCapacity: number
}) {
  if (selected.desiredBuild === 0) {
    const recipient = needing.find((peer) => peer.sku !== selected.sku) ?? needing[0]
    return (
      <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] leading-snug text-ink-muted">
        <p className="font-medium text-ink">No allocation needed</p>
        <p>
          {selected.sku} is already above its {selected.targetWeeks}-week target, so it does not need
          any of the line&apos;s available capacity.
        </p>
        {recipient && (
          <p>
            {recipient.sku} begins at {weeksPhrase(recipient.startingCoverage)} of cover and needs{' '}
            {units(recipient.desiredBuild)} units, so the engine allocates{' '}
            {recipient.build === lineCapacity
              ? `all ${units(lineCapacity)} available units`
              : `${units(recipient.build)} units`}{' '}
            to {recipient.sku}.
          </p>
        )}
      </div>
    )
  }

  if (!constrained) {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Line capacity covers every SKU&apos;s required build, so {selected.sku} receives the{' '}
        {units(selected.build)} units it asked for.
      </p>
    )
  }

  if (competing && rule === 'worst-first') {
    const winner = [...needing].sort((a, b) => a.gap - b.gap)[0]
    const thisWon = winner?.sku === selected.sku
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Both sizes need production, and the line cannot cover them. Capacity goes first to the SKU
        furthest below its target cover
        {thisWon
          ? `: ${selected.sku} began at ${weeksPhrase(selected.startingCoverage)} of cover, so it receives ${units(selected.build)} of the ${units(lineCapacity)} available.`
          : `. Capacity goes to ${winner.sku}, which began at ${weeksPhrase(winner.startingCoverage)} of cover versus this SKU’s ${weeksPhrase(selected.startingCoverage)}.`}
      </p>
    )
  }

  if (competing && rule === 'proportional') {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Both sizes need production, and the line cannot cover them. Each SKU receives the same
        fraction of its required build. {selected.sku} asked for {units(selected.desiredBuild)} units
        and receives {units(selected.build)} of the {units(lineCapacity)} available.
      </p>
    )
  }

  if (competing && rule === 'backlog-first') {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Both sizes need production, and the line cannot cover them. Capacity first serves existing
        backlog before rebuilding forward cover.
        {selected.startingBacklog > 0
          ? ` ${selected.sku} is owed ${units(selected.startingBacklog)} units and receives ${units(selected.build)} of the ${units(lineCapacity)} available.`
          : ` ${selected.sku} has no opening backlog this week and receives ${units(selected.build)} units after owed demand is served.`}
      </p>
    )
  }

  const recipient = others.find((peer) => peer.build > 0)
  return (
    <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
      Limited capacity was divided under the current allocation policy
      {recipient ? `, with ${recipient.sku} receiving ${units(recipient.build)} units.` : '.'}
    </p>
  )
}

function otherNeedSentence(others: PeerStanding[]): string {
  if (others.length === 1) {
    return `${others[0].sku} needs ${units(others[0].desiredBuild)} units`
  }
  const total = others.reduce((sum, peer) => sum + peer.desiredBuild, 0)
  return `${joinNames(others.map((peer) => peer.sku))} need ${units(total)} units combined`
}

function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function Stat({
  label,
  value,
  tone = 'ink',
  hint,
}: {
  label: string
  value: string
  tone?: 'ink' | 'pos' | 'warn'
  hint?: string | null
}) {
  return (
    <div>
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd
        className={cx(
          'mt-0.5 text-[13px] font-medium tnum',
          tone === 'pos' && 'text-pos',
          tone === 'warn' && 'text-warn',
          tone === 'ink' && 'text-ink',
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[10.5px] leading-snug text-ink-faint">{hint}</p>}
    </div>
  )
}

function Question({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-baseline gap-2 text-[12.5px] font-medium text-ink">
      <span className="text-ink-faint tnum">{n}.</span>
      {title}
    </h3>
  )
}

function Expandable({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-0.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
      >
        {label}
        <ChevronDownIcon className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      <div
        className={cx(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1.5 rounded-lg border border-edge px-3 py-2.5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function EndingPosition({
  shippedAgainst,
  endingBacklog,
}: {
  shippedAgainst: EquationTerm[]
  endingBacklog: number
}) {
  return (
    <>
      <Expandable label="What shipped draws against">
        <div className="text-[11px] text-ink-faint">Shipped against</div>
        <Equation terms={shippedAgainst} compact />
        <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
          Backlog and current plant demand draw on the same stock; current plant demand is the same
          net field as forecast.
        </p>
      </Expandable>
      {endingBacklog > 0 && (
        <p className="mt-2.5 text-[12px] text-neg">
          <span className="tnum font-medium">{units(endingBacklog)}</span> still owed — carries into next
          week.
        </p>
      )}
    </>
  )
}

function Equation({
  terms,
  compact = false,
  afterLabel,
  afterTerm,
}: {
  terms: EquationTerm[]
  compact?: boolean
  afterLabel?: Partial<Record<string, ReactNode>>
  afterTerm?: Partial<Record<string, ReactNode>>
}) {
  return (
    <dl className={cx('flex flex-col', compact ? 'mt-1.5' : 'mt-2.5')}>
      {terms.map((term, index) => (
        <div key={`${term.label}-${index}`}>
          <div
            className={cx(
              'flex items-start gap-2.5',
              compact ? 'py-1' : 'py-1.5',
              term.role === 'result' && 'mt-1 border-t border-edge pt-2',
            )}
          >
            <span className="w-3 shrink-0 text-center text-[12px] text-ink-faint">{term.operator}</span>
            <dt className="min-w-0 flex-1">
              <span
                className={cx(
                  compact ? 'text-[12px]' : 'text-[12.5px]',
                  term.role === 'result' ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {term.label}
              </span>
              {term.note && <span className="block text-[11px] text-ink-faint">{term.note}</span>}
              {afterLabel?.[term.label] ? <div className="mt-0.5">{afterLabel[term.label]}</div> : null}
            </dt>
            <dd
              className={cx(
                'shrink-0 tnum',
                compact ? 'text-[12px]' : 'text-[12.5px]',
                term.role === 'result' && 'font-medium',
                valueTone(term.role),
              )}
            >
              {units(term.value)}
            </dd>
          </div>
          {afterTerm?.[term.label]}
        </div>
      ))}
    </dl>
  )
}

function valueTone(role: TermRole): string {
  switch (role) {
    case 'obligation':
      return 'text-neg/90'
    case 'supply':
      return 'text-pos/90'
    case 'result':
      return 'text-ink'
    default:
      return 'text-ink-muted'
  }
}

function PeerList({
  peers,
  competing,
  rule,
  onSelectSku,
}: {
  peers: PeerStanding[]
  competing: boolean
  rule: RationingRule
  onSelectSku: (sku: string) => void
}) {
  if (peers.length < 2) return null

  const caption = competing ? ALLOCATION_PEER_CAPTIONS[rule] : null
  const maxBacklog = Math.max(0, ...peers.filter((peer) => peer.desiredBuild > 0).map((peer) => peer.startingBacklog))

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-edge">
      <div className="border-b border-edge bg-raised/40 px-3 py-1.5 text-[11px] text-ink-faint">
        Same line this week
        {caption ? ` · ${caption}` : null}
      </div>
      <ul className="divide-y divide-edge">
        {peers.map((peer) => {
          const above = peer.startingCoverage >= peer.targetWeeks
          const showPriority = allocationBadge(rule, peer, competing, maxBacklog)
          return (
            <li
              key={peer.sku}
              className={cx(
                'flex items-start gap-2 px-3 py-2',
                showPriority && 'bg-accent-soft/55',
                peer.isSelected && !showPriority && 'bg-hover/60',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {peer.isSelected ? (
                    <span className="text-[12.5px] font-medium tnum text-ink">
                      {peer.sku}{' '}
                      <span className="font-normal text-ink-faint">{peer.size}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectSku(peer.sku)}
                      className="text-left text-[12.5px] tnum text-accent-bright underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
                    >
                      {peer.sku}{' '}
                      <span className="text-ink-faint no-underline">{peer.size}</span>
                    </button>
                  )}
                  <Badge tone={above ? 'positive' : 'warning'}>
                    {above ? 'Already above target' : 'Below target'}
                  </Badge>
                  {showPriority && (
                    <Badge tone="accent" title={ALLOCATION_BADGE_LABELS[rule]}>
                      {ALLOCATION_BADGE_LABELS[rule]}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-faint tnum">
                  Started: {weeks(peer.startingCoverage, 2)} / {peer.targetWeeks}w target
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-ink-faint">
                  Needs <span className="tnum text-ink-muted">{units(peer.desiredBuild)}</span>
                </div>
                <div
                  className={cx(
                    'mt-0.5 tnum',
                    peer.build > 0 ? 'text-[13px] font-medium text-ink' : 'text-[12px] text-ink-muted',
                  )}
                >
                  Allocated {units(peer.build)}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function allocationBadge(
  rule: RationingRule,
  peer: PeerStanding,
  competing: boolean,
  maxBacklog: number,
): boolean {
  if (!competing || peer.desiredBuild === 0) return false
  if (rule === 'worst-first') return peer.prioritized
  if (rule === 'proportional') return peer.isSelected && peer.build > 0
  return maxBacklog > 0 && peer.startingBacklog === maxBacklog && peer.build > 0
}

function annotateNeed(need: EquationTerm[], treatment: DealerStockTreatment): EquationTerm[] {
  return need.map((term) => {
    if (term.label === 'Starting inventory' && treatment === 'central') {
      return { ...term, note: 'Includes dealer-held inventory (pooled with plant stock).' }
    }
    if (term.label === 'Current plant demand' && treatment === 'exclude') {
      return {
        ...term,
        note: 'Dealer-held inventory is ignored as supply; dealer-channel demand still reaches the plant.',
      }
    }
    if (term.label === 'Current plant demand' && treatment === 'central' && !term.note) {
      return {
        ...term,
        note: 'Dealer-channel demand reaches the plant in full; dealer stock is counted in starting inventory.',
      }
    }
    return term
  })
}
