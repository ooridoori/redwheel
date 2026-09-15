'use client'

/**
 * Why one planned-build number is what it is.
 *
 * Three questions: how much should we build, how much can we actually build,
 * and where that leaves us. Every figure comes from the plan row itself.
 */
import { LINE_LABELS } from '@/lib/domain'
import { units, weekLabelLong, weeks } from '@/lib/format'
import {
  derivationOf,
  type EquationTerm,
  type PeerStanding,
  type TermRole,
} from '@/lib/engine/derivation'
import { RATIONING_DESCRIPTIONS, RATIONING_LABELS, type RationingRule } from '@/lib/engine/policy'
import type { PlanRow } from '@/lib/engine'
import { Badge, Divider, cx } from '@/components/ui/primitives'
import { CloseIcon } from '@/components/ui/icons'
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
  const shorted = planRow.desiredBuild > planRow.build

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
          <Badge
            tone={
              planRow.endingCoverage >= planRow.targetWeeks
                ? 'positive'
                : planRow.endingCoverage < 0
                  ? 'negative'
                  : 'warning'
            }
          >
            {weeks(planRow.endingCoverage)} cover
          </Badge>
          <span className="text-[11.5px] text-ink-faint">against {planRow.targetWeeks}w target</span>
          {derivation.capacityConstrained && (
            <Badge tone="warning" title="The line's build needed exceeded its shared capacity this week">
              capacity constrained
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <section>
          <Question n={1} title="How much should we build?" />
          <Equation terms={derivation.need} />
        </section>

        <Divider />

        <section>
          <Question n={2} title="How much can we actually build?" />

          {derivation.capacityConstrained ? (
            <>
              <p className="mt-2 text-[12px] leading-snug text-ink-muted">
                {RATIONING_LABELS[rule]} · {RATIONING_DESCRIPTIONS[rule]}
              </p>
              <PeerList peers={derivation.peers} rule={rule} onSelectSku={onSelectSku} />
              <div className="mt-3 rounded-lg border border-edge bg-raised/60 px-3 py-2.5">
                <Equation terms={derivation.capacity} compact />
                {shorted && (
                  <p className="mt-2 text-[11.5px] text-ink-faint">
                    This SKU needed {units(planRow.desiredBuild)} and received {units(planRow.build)}.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2.5">
              <Equation terms={derivation.capacity} />
              <p className="mt-2 text-[11.5px] text-ink-faint">
                Within capacity, so every size received its build needed.
              </p>
            </div>
          )}
        </section>

        <Divider />

        <section>
          <Question n={3} title="Where does that leave us?" />
          <Equation terms={derivation.outcome} />
          <div className="mt-3 rounded-lg border border-edge px-3 py-2.5">
            <div className="text-[11px] text-ink-faint">Shipped against</div>
            <Equation terms={derivation.shippedAgainst} compact />
            <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
              Backlog and current plant demand draw on the same stock; the engine does not order them.
            </p>
          </div>
          {derivation.endingBacklog > 0 && (
            <p className="mt-2.5 text-[12px] text-neg">
              <span className="tnum font-medium">{units(derivation.endingBacklog)}</span> still owed —
              carries into next week.
            </p>
          )}
        </section>
      </div>
    </aside>
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

function Equation({ terms, compact = false }: { terms: EquationTerm[]; compact?: boolean }) {
  return (
    <dl className={cx('flex flex-col', compact ? 'mt-1.5' : 'mt-2.5')}>
      {terms.map((term, index) => (
        <div
          key={`${term.label}-${index}`}
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

  return (
    <div className="mt-2.5 overflow-hidden rounded-lg border border-edge">
      <div className="border-b border-edge bg-raised/40 px-3 py-1.5 text-[11px] text-ink-faint">
        Same line this week
        {rule === 'worst-first' ? ' · ranked by weeks below target' : null}
      </div>
      <ul className="divide-y divide-edge">
        {peers.map((peer) => (
          <li
            key={peer.sku}
            className={cx(
              'flex items-center gap-2 px-3 py-2',
              peer.isSelected && 'bg-accent-soft/50',
            )}
          >
            <div className="min-w-0 flex-1">
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
              <div className="mt-0.5 text-[11px] text-ink-faint tnum">
                {weeks(peer.startingCoverage)} / {peer.targetWeeks}w target
                <span className="mx-1.5 text-edge-strong">·</span>
                <span className={peer.gap < 0 ? 'text-neg' : 'text-pos'}>
                  {peer.gap >= 0 ? '+' : ''}
                  {weeks(peer.gap)}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[12px] tnum text-ink">{units(peer.build)}</div>
              <div className="text-[10.5px] text-ink-faint">
                {peer.isSelected
                  ? 'planned · selected'
                  : peer.prioritized && rule === 'worst-first'
                    ? 'planned · prioritized'
                    : `planned · need ${units(peer.desiredBuild)}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
