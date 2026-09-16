'use client'

/**
 * Why one planned-build number is what it is.
 *
 * Need → constraint → prioritization → outcome. Every figure is read from the
 * plan row; this drawer never reruns the engine.
 */
import { useState, type ReactNode } from 'react'
import { LINE_LABELS } from '@/lib/domain'
import { units, weekLabelLong, weeksPhrase } from '@/lib/format'
import {
  derivationOf,
  type EquationTerm,
  type PeerStanding,
  type TermRole,
} from '@/lib/engine/derivation'
import type { RationingRule } from '@/lib/engine/policy'
import type { PlanRow } from '@/lib/engine'
import { Badge, Divider, cx } from '@/components/ui/primitives'
import { CheckIcon, ChevronDownIcon, CloseIcon } from '@/components/ui/icons'
import { skuStatus } from '@/lib/engine/status'
import type { TableRow } from './rows'

export function DerivationDrawer({
  row,
  lineRows,
  rule,
  onClose,
  onSelectSku,
}: {
  row: TableRow
  /** Every SKU on this line in the same week — used to show who got capacity. */
  lineRows: PlanRow[]
  rule: RationingRule
  onClose: () => void
  onSelectSku: (sku: string) => void
}) {
  const { row: planRow, lineWeek } = row.detail
  const derivation = derivationOf(planRow, lineWeek, lineRows)
  const status = skuStatus(planRow)
  const winner = derivation.peers.find((peer) => peer.prioritized)
  const thisPrioritized = derivation.peers.some((peer) => peer.isSelected && peer.prioritized)

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

        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.met ? 'positive' : 'warning'}>
              {status.met ? <CheckIcon /> : null}
              {status.label}
            </Badge>
            {status.detail && (
              <span className="text-[11.5px] text-warn">{status.detail}</span>
            )}
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Stat label="Target cover" value={weeksPhrase(planRow.targetWeeks, 1)} />
          <Stat
            label="Projected cover"
            value={weeksPhrase(planRow.endingCoverage)}
            tone={status.met ? 'pos' : 'warn'}
          />
          <Stat label="Required build" value={units(planRow.desiredBuild)} />
          <Stat
            label="Allocated build"
            value={units(planRow.build)}
            tone={planRow.build < planRow.desiredBuild ? 'warn' : 'ink'}
          />
        </dl>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <section>
          <Question n={1} title="Need" />
          <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
            This SKU needs {units(planRow.desiredBuild)} units to finish at{' '}
            {weeksPhrase(planRow.targetWeeks, 1)} of cover. It starts at{' '}
            {weeksPhrase(planRow.startingCoverage)} ({units(planRow.startingNet)} after
            backlog).
          </p>
          <Expandable label={`${units(planRow.desiredBuild)} units required`}>
            <Equation terms={derivation.need} compact />
          </Expandable>
        </section>

        <Divider />

        <section>
          <Question n={2} title="Constraint" />
          {derivation.capacityConstrained ? (
            <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
              Combined need is {units(lineWeek.desiredBuild)} against{' '}
              {units(lineWeek.capacity)} of line capacity — {units(lineWeek.unmet)} short, so
              the line has to choose.
            </p>
          ) : (
            <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
              Line capacity covers every SKU&apos;s need this week.
            </p>
          )}
          <div className="mt-2.5 rounded-lg border border-edge bg-raised/60 px-3 py-2.5">
            <Equation terms={derivation.capacity} compact />
          </div>
        </section>

        <Divider />

        <section>
          <Question n={3} title="Prioritization" />
          {derivation.capacityConstrained ? (
            <PriorityCopy
              rule={rule}
              thisPrioritized={thisPrioritized}
              winner={winner}
              selected={planRow}
            />
          ) : (
            <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
              No rationing. Every size received its required build.
            </p>
          )}
          <PeerList peers={derivation.peers} rule={rule} onSelectSku={onSelectSku} />
        </section>

        <Divider />

        <section>
          <Question n={4} title="Outcome" />
          <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
            Ends at {units(planRow.endingInventory)} units —{' '}
            {weeksPhrase(planRow.endingCoverage)} of cover
            {status.met ? '.' : `, ${status.label.toLowerCase()}.`}
          </p>
          <EndingPosition
            key={`${planRow.sku}|${planRow.weekStart}`}
            outcome={derivation.outcome}
            shippedAgainst={derivation.shippedAgainst}
            endingBacklog={derivation.endingBacklog}
          />
        </section>
      </div>
    </aside>
  )
}

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string
  value: string
  tone?: 'ink' | 'pos' | 'warn'
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

function PriorityCopy({
  rule,
  thisPrioritized,
  winner,
  selected,
}: {
  rule: RationingRule
  thisPrioritized: boolean
  winner: PeerStanding | undefined
  selected: PlanRow
}) {
  if (rule !== 'worst-first' || !winner) {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Limited capacity was divided under the current rationing rule.
      </p>
    )
  }

  if (thisPrioritized) {
    return (
      <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
        Prioritized — furthest below target. This SKU began at{' '}
        {weeksPhrase(selected.startingCoverage)} of cover.
      </p>
    )
  }

  return (
    <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">
      Not prioritized this week. Line capacity was allocated to {winner.sku}, which began at{' '}
      {weeksPhrase(winner.startingCoverage)} of cover versus this SKU&apos;s{' '}
      {weeksPhrase(selected.startingCoverage)}.
    </p>
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
  outcome,
  shippedAgainst,
  endingBacklog,
}: {
  outcome: EquationTerm[]
  shippedAgainst: EquationTerm[]
  endingBacklog: number
}) {
  const [open, setOpen] = useState(false)
  const ending = outcome.find((term) => term.label === 'Ending inventory')

  return (
    <>
      <div className="mt-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 text-[12px] text-ink-muted transition-colors hover:text-ink"
        >
          {ending ? `${units(ending.value)} ending inventory` : 'Inventory math'}
          <ChevronDownIcon className={cx('transition-transform', open && 'rotate-180')} />
        </button>
        <div
          className={cx(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1.5 rounded-lg border border-edge px-3 py-2.5">
              <Equation
                terms={outcome.map((term) =>
                  term.label === 'Shipped' ? { ...term, note: undefined } : term,
                )}
                compact
                afterLabel={{
                  Shipped: (
                    <span className="block text-[11px] text-ink-faint">
                      Against backlog and current plant demand (the same net field as forecast)
                    </span>
                  ),
                }}
              />
              <div className="mt-2 border-t border-edge pt-2">
                <div className="text-[11px] text-ink-faint">Shipped against</div>
                <Equation terms={shippedAgainst} compact />
              </div>
            </div>
          </div>
        </div>
      </div>
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
  rule,
  onSelectSku,
}: {
  peers: PeerStanding[]
  rule: RationingRule
  onSelectSku: (sku: string) => void
}) {
  if (peers.length < 2) return null

  const worstFirst = rule === 'worst-first'

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-edge">
      <div className="border-b border-edge bg-raised/40 px-3 py-1.5 text-[11px] text-ink-faint">
        Same line this week
        {worstFirst ? ' · furthest below target first' : null}
      </div>
      <ul className="divide-y divide-edge">
        {peers.map((peer) => {
          const prioritized = worstFirst && peer.prioritized
          return (
            <li
              key={peer.sku}
              className={cx(
                'flex items-center gap-2 px-3 py-2',
                prioritized && 'bg-accent-soft/55',
                peer.isSelected && !prioritized && 'bg-hover/60',
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
                  {prioritized && (
                    <Badge tone="accent" title="Chosen first because it started furthest below target">
                      Prioritized — furthest below target
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-ink-faint tnum">
                  Started at {weeksPhrase(peer.startingCoverage)}
                </div>
                {!prioritized && worstFirst && (
                  <div className="mt-0.5 text-[11px] text-ink-faint">Not prioritized this week</div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={cx(
                    'tnum',
                    prioritized ? 'text-[13px] font-medium text-ink' : 'text-[12px] text-ink-muted',
                  )}
                >
                  Allocated {units(peer.build)}
                </div>
                <div className="mt-0.5 text-[10.5px] text-ink-faint">Need {units(peer.desiredBuild)}</div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
