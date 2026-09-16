'use client'

/**
 * The numbers that answer: is this plan hitting target, where is it not, and why.
 *
 * SKU-week attainment is the primary "are we hitting target" figure. Line cover
 * at the end of the horizon is a recovery check, not a substitute for it.
 */
import { LINE_LABELS } from '@/lib/domain'
import { compactUnits, percent, units, weekLabelLong, weeks } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { insightsFor, type InsightAction } from '@/lib/engine/insights'
import { scopeKpis, type Scope, type ScopeKpis } from '@/lib/engine/scope'
import { Meter, Bone, cx } from '@/components/ui/primitives'
import { InfoTip } from '@/components/ui/info-tip'
import { InfoIcon, WarningIcon } from '@/components/ui/icons'

export function KpiRow({
  plan,
  previousPlan,
  scope,
  visibleWeeks,
}: {
  plan: BuildPlan
  /** The plan before the last run, for `was …` comparisons. */
  previousPlan: BuildPlan | null
  scope: Scope
  visibleWeeks: string[]
}) {
  const cards = cardsFor(scopeKpis(plan, scope, visibleWeeks), visibleWeeks.length < plan.weeks.length)
  const before = previousPlan
    ? cardsFor(scopeKpis(previousPlan, scope, visibleWeeks), visibleWeeks.length < previousPlan.weeks.length)
    : null

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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

function cardsFor(kpis: ScopeKpis, rangeScoped: boolean): KpiCard[] {
  const isRange = kpis.linesInScope > 1
  const onTrack = kpis.linesAtTarget === kpis.linesInScope
  const tightest =
    kpis.tightestLine && kpis.linesInScope > 1
      ? `Tightest line: ${LINE_LABELS[kpis.tightestLine]}`
      : `${compactUnits(kpis.totalBuild)} of ${compactUnits(kpis.totalCapacity)} units`

  return [
    {
      label: rangeScoped ? 'Selected range target attainment' : 'Horizon target attainment',
      value: `${units(kpis.skuWeeksAtTarget)} / ${units(kpis.skuWeeks)}`,
      tone: kpis.skuWeeksMissedToCapacity === 0 ? 'positive' : 'warning',
      detail:
        kpis.skuWeeksMissedToCapacity === 0
          ? `${units(kpis.skuWeeksAtTarget)} of ${units(kpis.skuWeeks)} SKU-weeks meet target`
          : `${units(kpis.skuWeeksAtTarget)} of ${units(kpis.skuWeeks)} SKU-weeks meet target and ${units(kpis.skuWeeksMissedToCapacity)} miss due to capacity constraints`,
      hint: rangeScoped
        ? 'One count per SKU per week in the selected date range. A miss is a week whose ending cover is below target because the SKU was shorted on a constrained line.'
        : 'One count per SKU per planned week over the full horizon. A miss is a week whose ending cover is below target because the SKU was shorted on a constrained line.',
    },
    {
      label: 'Backlog',
      value: units(kpis.backlogAtStart),
      tone: kpis.backlogAtStart > 0 ? 'negative' : 'positive',
      detail: kpis.backlogClearedWeek
        ? `Clears ${weekLabelLong(kpis.backlogClearedWeek)}`
        : `${units(kpis.backlogAtEnd)} still owed at the end`,
      hint: 'Opening backlog at the snapshot, and the week it reaches zero across the lines in view.',
    },
    {
      label: 'Overall plan utilization',
      value: percent(kpis.utilization, 0),
      detail: tightest,
      meter: kpis.utilization,
      hint: 'Planned build as a share of capacity over the full horizon. The table footer shows selected-range utilization. Capacity cannot be transferred across lines.',
    },
    {
      label: 'End-of-horizon line status',
      value: `${kpis.linesAtTarget} / ${kpis.linesInScope}`,
      tone: onTrack ? 'positive' : 'warning',
      detail:
        `${kpis.linesAtTarget} / ${kpis.linesInScope} ${kpis.linesInScope === 1 ? 'line finishes' : 'lines finish'} the horizon at target` +
        (kpis.skuWeeksMissedToCapacity > 0
          ? '. Individual SKU shortages occur earlier in constrained weeks.'
          : ''),
      hint:
        kpis.skuWeeksMissedToCapacity > 0
          ? 'Line cover at the last planned week. Individual SKU shortages occur earlier in constrained weeks.'
          : `Projected cover by line is ${weeks(kpis.projectedLow)}${kpis.projectedLow !== kpis.projectedHigh ? ` – ${weeks(kpis.projectedHigh)}` : ''}.`,
    },
    {
      label: 'Cover at snapshot',
      value:
        isRange && kpis.currentLow !== kpis.currentHigh
          ? `${weeks(kpis.currentLow)} \u2013 ${weeks(kpis.currentHigh)}`
          : weeks(kpis.currentHigh),
      tone: kpis.currentLow < kpis.targetNowLow ? 'negative' : 'neutral',
      detail: kpis.currentLow < 0 ? 'Backlog exceeds available inventory' : 'Opening position',
      hint:
        kpis.currentLow < 0
          ? 'Negative values mean backlog exceeds available inventory at the snapshot.'
          : isRange && kpis.currentLow !== kpis.currentHigh
            ? 'Opening cover by line at the snapshot. A range means the lines in view start at different positions.'
            : 'Opening cover at the snapshot, before any planned build.',
    },
  ]
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

export function InsightPanel({
  plan,
  scope,
  visibleWeeks,
  onViewSku,
}: {
  plan: BuildPlan
  scope: Scope
  visibleWeeks: string[]
  onViewSku?: (action: InsightAction) => void
}) {
  const insights = insightsFor(plan, scope, visibleWeeks)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-ink">What to watch</h2>
        <span className="text-[11px] text-ink-faint" title="Generated from the plan on screen">
          {scope === 'all' ? 'All lines' : LINE_LABELS[scope]}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
        {insights.map((insight) => (
          <div
            key={insight.category}
            className={cx(
              'flex gap-2.5',
              insight.category === 'Recommended focus' && 'mt-auto border-t border-edge pt-2.5',
            )}
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
              <div className="text-[15px] font-medium text-ink">{insight.category}</div>
              <p className="mt-0.5 text-[14px] leading-snug text-ink-muted">{insight.body}</p>
              {insight.action && onViewSku && (
                <button
                  type="button"
                  onClick={() => onViewSku(insight.action!)}
                  className="mt-1 text-[14px] text-accent-bright underline decoration-dotted underline-offset-2 transition-colors hover:text-ink"
                >
                  {insight.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const KPI_LABELS = [
  'Selected range target attainment',
  'Backlog',
  'Overall plan utilization',
  'End-of-horizon line status',
  'Cover at snapshot',
] as const

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" aria-hidden>
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
        <h2 className="text-[15px] font-medium text-ink">What to watch</h2>
        <Bone className="h-3 w-16" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-11/12" />
        <Bone className="mt-1 h-3 w-12" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-4/5" />
        <Bone className="mt-1 h-3 w-14" />
        <Bone className="h-3 w-full" />
      </div>
    </div>
  )
}
