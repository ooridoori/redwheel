'use client'

/**
 * The five numbers that answer "are we hitting target, and what will it cost".
 *
 * Weeks of supply is per line, so with every line in view the cover figures are
 * shown as a range rather than a blended average — the range is the honest
 * answer, and narrowing the product group makes it exact.
 */
import { LINE_LABELS } from '@/lib/domain'
import { compactUnits, percent, units, weekLabelLong, weeks } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { insightsFor } from '@/lib/engine/insights'
import { scopeKpis, type Scope, type ScopeKpis } from '@/lib/engine/scope'
import { Meter, Bone, cx } from '@/components/ui/primitives'
import { InfoTip } from '@/components/ui/info-tip'
import { InfoIcon, WarningIcon } from '@/components/ui/icons'

export function KpiRow({
  plan,
  previousPlan,
  scope,
}: {
  plan: BuildPlan
  /** The plan before the last run, for `was …` comparisons. */
  previousPlan: BuildPlan | null
  scope: Scope
}) {
  const cards = cardsFor(scopeKpis(plan, scope))
  // Built through the same formatters, so a card is only marked as changed when
  // the figure on screen genuinely reads differently.
  const before = previousPlan ? cardsFor(scopeKpis(previousPlan, scope)) : null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {cards.map((card, index) => {
        const was = before?.[index]
        return (
          <Kpi
            key={card.label}
            {...card}
            previousValue={was && was.value !== card.value ? was.value : undefined}
          />
        )
      })}
    </div>
  )
}

interface KpiCard {
  label: string
  value: string
  detail: string
  /** One-line explanation for a derived or easy-to-misread figure. */
  hint?: string
  tone?: 'neutral' | 'positive' | 'negative' | 'warning'
  meter?: number
}

function cardsFor(kpis: ScopeKpis): KpiCard[] {
  const isRange = kpis.linesInScope > 1
  const onTrack = kpis.linesAtTarget === kpis.linesInScope

  return [
    {
      label: 'Target cover',
      value: range(kpis.targetNowLow, kpis.targetNowHigh),
      detail:
        kpis.targetNowHigh === kpis.targetHigh && kpis.targetNowLow === kpis.targetLow
          ? isRange
            ? 'Varies by line'
            : 'From the brief'
          : `Steps to ${range(kpis.targetLow, kpis.targetHigh)} in 2028`,
      hint: isRange
        ? 'Required weeks of cover. A range means the lines in view have different targets.'
        : undefined,
    },
    {
      label: 'Cover at snapshot',
      value:
        isRange && kpis.currentLow !== kpis.currentHigh
          ? `${weeks(kpis.currentLow)} \u2013 ${weeks(kpis.currentHigh)}`
          : weeks(kpis.currentHigh),
      tone: kpis.currentLow < kpis.targetLow ? 'negative' : 'neutral',
      detail: kpis.currentLow < 0 ? 'More units owed than held' : 'Opening position',
      hint:
        isRange && kpis.currentLow !== kpis.currentHigh
          ? 'Opening cover by line. A range means the lines in view start at different positions.'
          : kpis.currentLow < 0
            ? 'Negative cover means more units are owed than held at the snapshot.'
            : undefined,
    },
    {
      label: 'End-of-horizon line cover',
      value: `${kpis.linesAtTarget} / ${kpis.linesInScope}`,
      tone: onTrack ? 'positive' : 'warning',
      detail:
        kpis.skuWeeksMissedToCapacity > 0
          ? 'Line averages may mask SKU-level shortages'
          : kpis.linesInScope === 1
            ? onTrack
              ? 'This line finishes at target'
              : 'This line finishes below target'
            : 'Every line finishes at target',
      hint: isRange
        ? `Projected cover by line is ${weeks(kpis.projectedLow)} – ${weeks(kpis.projectedHigh)}. A line can be at target while one of its sizes is not.`
        : `Projected cover ${weeks(kpis.projectedHigh)} against a ${kpis.targetHigh}w target.`,
    },
    {
      label: 'SKU target attainment',
      value: `${units(kpis.skuWeeksAtTarget)} / ${units(kpis.skuWeeks)}`,
      tone: kpis.skuWeeksMissedToCapacity === 0 ? 'positive' : 'warning',
      detail:
        kpis.skuWeeksMissedToCapacity === 0
          ? 'Every SKU-week at target'
          : `${units(kpis.skuWeeksMissedToCapacity)} misses due to capacity`,
      hint: 'One count per SKU per planned week. A miss is a week whose ending cover is below target; on this plan those are weeks the SKU was shorted on a constrained line.',
    },
    {
      label: 'Overall capacity utilization',
      value: percent(kpis.utilization, 1),
      detail: `${compactUnits(kpis.totalBuild)} of ${compactUnits(kpis.totalCapacity)} units`,
      meter: kpis.utilization,
      hint: 'Planned build as a share of capacity over the full horizon. The table footer shows selected range utilization.',
    },
    {
      label: 'Backlog',
      value: units(kpis.backlogAtStart),
      tone: kpis.backlogAtStart > 0 ? 'negative' : 'positive',
      detail: kpis.backlogClearedWeek
        ? `Clears ${weekLabelLong(kpis.backlogClearedWeek)}`
        : `${units(kpis.backlogAtEnd)} still owed at the end`,
    },
  ]
}

/** `8w`, or `8–15w` when the lines in scope disagree. */
function range(low: number, high: number): string {
  return low === high ? `${high}w` : `${low}\u2013${high}w`
}

function Kpi({
  label,
  value,
  detail,
  hint,
  tone = 'neutral',
  meter,
  previousValue,
}: KpiCard & {
  /** Set only when the last run moved this figure. */
  previousValue?: string
}) {
  const valueTone =
    tone === 'positive'
      ? 'text-pos'
      : tone === 'negative'
        ? 'text-neg'
        : tone === 'warning'
          ? 'text-warn'
          : 'text-ink'

  return (
    <div className="rounded-xl border border-edge bg-surface px-4 py-3">
      <div className="flex items-center gap-1">
        <div className="eyebrow">{label}</div>
        {hint && <InfoTip text={hint} />}
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span
          className={cx(
            'text-[24px] leading-8 font-medium tnum',
            valueTone,
            previousValue && 'changed -mx-1 px-1',
          )}
        >
          {value}
        </span>
        {previousValue && (
          <span className="text-[11px] text-ink-faint tnum" title="Value before the last run">
            was {previousValue}
          </span>
        )}
      </div>
      {meter === undefined ? (
        <div className="mt-0.5 text-[11.5px] text-ink-faint">{detail}</div>
      ) : (
        <div className="mt-1.5">
          <Meter value={meter} tone={meter > 0.95 ? 'warning' : 'accent'} />
          <div className="mt-1 text-[11.5px] text-ink-faint">{detail}</div>
        </div>
      )}
    </div>
  )
}

export function InsightPanel({ plan, scope }: { plan: BuildPlan; scope: Scope }) {
  const insights = insightsFor(plan, scope)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink">Planner insight</h2>
        <span className="text-[11px] text-ink-faint" title="Generated from the plan on screen">
          {scope === 'all' ? 'All lines' : LINE_LABELS[scope]}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {insights.map((insight) => (
          <div
            key={insight.title}
            className={cx('flex gap-2.5', insight.compact && 'mt-auto border-t border-edge pt-2.5')}
          >
            <span
              className={cx(
                'mt-0.5 shrink-0',
                insight.tone === 'watch' ? 'text-warn' : insight.tone === 'good' ? 'text-pos' : 'text-ink-faint',
              )}
            >
              {insight.tone === 'watch' ? <WarningIcon /> : <InfoIcon />}
            </span>
            <div>
              {!insight.compact && <div className="text-[12px] font-medium text-ink">{insight.title}</div>}
              <p
                className={cx(
                  'leading-snug text-ink-muted',
                  insight.compact ? 'text-[11.5px]' : 'mt-0.5 text-[12px]',
                )}
              >
                {insight.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const KPI_LABELS = [
  'Target cover',
  'Cover at snapshot',
  'End-of-horizon line cover',
  'SKU target attainment',
  'Overall capacity utilization',
  'Backlog',
] as const

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-hidden>
      {KPI_LABELS.map((label) => (
        <div key={label} className="rounded-xl border border-edge bg-surface px-4 py-3">
          <div className="eyebrow">{label}</div>
          <Bone className="mt-2 h-7 w-24" />
          <Bone className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

export function InsightSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-hidden>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink">Planner insight</h2>
        <Bone className="h-3 w-16" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Bone className="h-3 w-14" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-11/12" />
        <Bone className="mt-1 h-3 w-10" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-4/5" />
        <div className="mt-auto border-t border-edge pt-2.5">
          <Bone className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  )
}
