'use client'

/**
 * Why one build number is what it is.
 *
 * Three questions in order: how many units did this SKU need, how many did the
 * line actually give it, and where did the week leave it. Every figure comes
 * from the plan row itself, so this panel cannot drift out of step with the
 * table beside it.
 */
import { LINE_LABELS } from '@/lib/domain'
import { units, weekLabelLong, weeks } from '@/lib/format'
import { derivationOf, type DerivationStep } from '@/lib/engine/derivation'
import { RATIONING_DESCRIPTIONS, RATIONING_LABELS, type RationingRule } from '@/lib/engine/policy'
import { Badge, Divider, cx } from '@/components/ui/primitives'
import { CloseIcon } from '@/components/ui/icons'
import type { TableRow } from './rows'

export function DerivationDrawer({
  row,
  rule,
  onClose,
}: {
  row: TableRow
  rule: RationingRule
  onClose: () => void
}) {
  const { row: planRow, lineWeek } = row.detail
  const derivation = derivationOf(planRow, lineWeek, rule)

  return (
    <aside className="flex w-[380px] shrink-0 flex-col overflow-y-auto border-l border-edge bg-surface">
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

        <div className="mt-3 flex items-center gap-2">
          <Badge tone={planRow.endingCoverage >= planRow.targetWeeks ? 'positive' : planRow.endingCoverage < 0 ? 'negative' : 'warning'}>
            {weeks(planRow.endingCoverage)} cover
          </Badge>
          <span className="text-[11.5px] text-ink-faint">against {planRow.targetWeeks}w target</span>
          {derivation.wasRationed && (
            <Badge tone="warning" title="The line could not cover every size's build needed this week">
              rationed
            </Badge>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-5 px-5 py-5">
        <Steps title="Build needed" steps={derivation.need} />
        <Divider />
        <Steps title="Planned build" steps={derivation.allocation} />

        {derivation.wasRationed && (
          <div className="rounded-lg border border-warn/25 bg-warn-soft px-3 py-2.5">
            <div className="text-[12px] font-medium text-warn">
              {RATIONING_LABELS[rule]} decided this split
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {RATIONING_DESCRIPTIONS[rule]}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
              This SKU opened the week at {weeks(planRow.startingCoverage)} against a{' '}
              {planRow.targetWeeks}w target, so it was{' '}
              <span className="tnum text-ink-muted">
                {weeks(planRow.startingCoverage - planRow.targetWeeks)}
              </span>{' '}
              below it.
            </p>
          </div>
        )}

        <Divider />
        <Steps title="Ending position" steps={derivation.outcome} />

        {planRow.absorbedByDealers > 0 && (
          <div className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-2.5">
            <div className="text-[12px] font-medium text-accent-bright">Dealer stock covered part of demand</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              <span className="tnum">{units(planRow.grossForecast)}</span> total demand ·{' '}
              <span className="tnum">{units(planRow.absorbedByDealers)}</span> covered by dealer stock ·{' '}
              <span className="tnum">{units(planRow.forecast)}</span> remaining factory demand.
            </p>
          </div>
        )}

        {planRow.endingBacklog > 0 && (
          <div className="rounded-lg border border-neg/25 bg-neg-soft px-3 py-2.5">
            <div className="text-[12px] font-medium text-neg">Still owed after this week</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              <span className="tnum">{units(planRow.endingBacklog)}</span> units remain unfulfilled and
              carry into next week.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}

function Steps({ title, steps }: { title: string; steps: DerivationStep[] }) {
  return (
    <div>
      <h3 className="text-[12.5px] font-medium text-ink">{title}</h3>
      <dl className="mt-2.5 flex flex-col">
        {steps.map((step, index) => (
          <div
            key={`${step.label}-${index}`}
            className={cx(
              'flex items-start gap-3 py-1.5',
              step.emphasis && 'mt-1 border-t border-edge pt-2.5',
            )}
          >
            <span
              className={cx(
                'w-3 shrink-0 text-center text-[12px]',
                step.operator === '=' ? 'text-ink-faint' : 'text-ink-faint',
              )}
            >
              {step.operator}
            </span>
            <dt className="flex-1">
              <span className={cx('text-[12.5px]', step.emphasis ? 'text-ink' : 'text-ink-muted')}>
                {step.label}
              </span>
              {step.note && <span className="block text-[11.5px] text-ink-faint">{step.note}</span>}
            </dt>
            <dd
              className={cx(
                'shrink-0 tnum text-[12.5px]',
                step.emphasis ? 'font-medium text-ink' : 'text-ink-muted',
              )}
            >
              {units(step.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
