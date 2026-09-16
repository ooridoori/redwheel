'use client'

/**
 * Line-level cover vs target: when does each production line recover?
 *
 * Plots engine `lineWeeks` only. SKU shortages are a different grain — the
 * title, subtitle and caption say so, because a line at target can still hide
 * a size that is not.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LINES, LINE_LABELS, type LineId } from '@/lib/domain'
import { monthLabel, weekLabelLong, weeks, weeksPhrase } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { targetWeeksFor } from '@/lib/engine/policy'
import type { Scope } from '@/lib/engine/scope'
import {
  coverAxis,
  coverStatus,
  recoveryCaption,
  recoveryEvents,
} from '@/lib/engine/line-cover-view'
import { chartReconcileCue } from '@/lib/engine/insights'
import { Bone } from '@/components/ui/primitives'

export const LINE_COLORS: Record<LineId, string> = {
  'road-base': '#7c87f5',
  'road-carbon': '#56c7e6',
  'mtb-base': '#3fcf8e',
  'mtb-carbon': '#e5a05b',
}

function targetKey(line: LineId): string {
  return `${line}Target`
}

export function WosChart({
  plan,
  scope,
  visibleWeeks,
}: {
  plan: BuildPlan
  scope: Scope
  /** The weeks the table is showing, shaded so the two views stay tied together. */
  visibleWeeks: string[]
}) {
  const lines = scope === 'all' ? LINES : [scope]
  const recoveries = recoveryEvents(plan, lines)
  const recoveredAt = new Map(recoveries.map((event) => [event.line, event.week]))
  const axis = coverAxis(plan, lines)
  const cue = chartReconcileCue(plan, scope)
  const single = lines.length === 1
  const startTarget = single ? targetWeeksFor(plan.policy, lines[0], plan.weeks[0]) : null
  const endTarget = single ? targetWeeksFor(plan.policy, lines[0], plan.weeks.at(-1)!) : null
  const targetLabel =
    startTarget != null && endTarget != null
      ? startTarget === endTarget
        ? `Target = ${startTarget}w`
        : `Target = ${startTarget}w \u2192 ${endTarget}w`
      : null

  const coverageByKey = new Map(
    plan.lineWeeks.map((entry) => [`${entry.weekStart}|${entry.line}`, entry]),
  )

  const data = plan.weeks.map((week) => {
    const point: Record<string, string | number> = { week }
    for (const line of lines) {
      const entry = coverageByKey.get(`${week}|${line}`)
      if (!entry) continue
      const cover = Number(entry.endingCoverage.toFixed(2))
      point[line] = axis.capped ? Math.min(cover, axis.max) : cover
      point[targetKey(line)] = entry.targetWeeks
    }
    return point
  })

  const shadeFrom = visibleWeeks[0]
  const shadeTo = visibleWeeks.at(-1)
  const showShade = Boolean(shadeFrom && shadeTo && visibleWeeks.length < plan.weeks.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex shrink-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-ink">Line-level cover vs target</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-faint">
            Aggregated line cover; individual SKUs may still be below target.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lines.map((line) => (
            <span key={line} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: LINE_COLORS[line] }} />
              {LINE_LABELS[line]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span className="w-3.5 border-t border-ink-muted" />
            Projected
            <span className="ml-1 w-3.5 border-t border-dashed border-ink-muted" />
            Target
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={140}>
          <LineChart data={data} margin={{ top: 14, right: single ? 72 : 10, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#272a32" vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={monthLabel}
              minTickGap={28}
              stroke="#6e7480"
              fontSize={10.5}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[axis.min, axis.max]}
              allowDataOverflow
              tickFormatter={(value: number) => `${value}w`}
              stroke="#6e7480"
              fontSize={10.5}
              tickLine={false}
              axisLine={false}
            />

            {showShade && (
              <ReferenceArea
                x1={shadeFrom}
                x2={shadeTo}
                fill="#7c87f5"
                fillOpacity={0.12}
                strokeOpacity={0}
                label={{
                  value: 'Selected range',
                  position: 'insideTopLeft',
                  fill: '#7c87f5',
                  fontSize: 10.5,
                }}
              />
            )}

            <ReferenceLine y={0} stroke="#4a4f5e" strokeWidth={1} />

            {single && endTarget != null && targetLabel && (
              <ReferenceLine
                y={endTarget}
                stroke="transparent"
                label={{
                  value: targetLabel,
                  position: 'right',
                  fill: LINE_COLORS[lines[0]],
                  fontSize: 10.5,
                }}
              />
            )}

            <Tooltip
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 40, pointerEvents: 'none', outline: 'none' }}
              content={({ active, label }) =>
                active && label ? (
                  <CoverTooltip week={String(label)} lines={lines} plan={plan} />
                ) : null
              }
            />

            {lines.map((line) => (
              <Line
                key={targetKey(line)}
                type="stepAfter"
                dataKey={targetKey(line)}
                stroke={LINE_COLORS[line]}
                strokeDasharray="4 3"
                strokeWidth={1.15}
                strokeOpacity={0.55}
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ))}

            {lines.map((line) => (
              <Line
                key={line}
                type="monotone"
                dataKey={line}
                stroke={LINE_COLORS[line]}
                strokeWidth={1.7}
                isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload } = props as {
                    cx?: number
                    cy?: number
                    payload?: { week?: string }
                  }
                  if (recoveredAt.get(line) !== payload?.week || cx == null || cy == null) {
                    return false
                  }
                  return (
                    <circle
                      key={`${line}-recovered`}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill={LINE_COLORS[line]}
                      stroke="#12141a"
                      strokeWidth={1.2}
                    />
                  )
                }}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {cue && (
        <p className="mt-1 shrink-0 text-[13px] leading-snug text-ink-muted">{cue}</p>
      )}

      {recoveries.length > 0 && (
        <p className="mt-0.5 shrink-0 text-[10.5px] leading-snug text-ink-faint">
          {recoveries.map((event) => recoveryCaption(event)).join('  ·  ')}
        </p>
      )}

      {axis.capped && axis.overflow.length > 0 && (
        <p className="mt-0.5 shrink-0 text-[10.5px] leading-snug text-ink-faint">
          {axis.overflow.map((entry) => `${LINE_LABELS[entry.line]} peaks at ${weeks(entry.peak)}`).join('; ')};
          scale capped at {axis.max}w so the target zone stays readable.
        </p>
      )}
    </div>
  )
}

function CoverTooltip({
  week,
  lines,
  plan,
}: {
  week: string
  lines: LineId[]
  plan: BuildPlan
}) {
  const rows = lines
    .map((line) => plan.lineWeeks.find((entry) => entry.weekStart === week && entry.line === line))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)

  if (rows.length === 0) return null

  const single = rows.length === 1

  if (single) {
    const row = rows[0]
    const status = coverStatus(row.endingCoverage, row.targetWeeks)
    const gap = row.targetWeeks - row.endingCoverage
    return (
      <div className="min-w-[180px] rounded-lg border border-edge-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-xl">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: LINE_COLORS[row.line] }} />
          <span className="font-medium text-ink">{LINE_LABELS[row.line]}</span>
        </div>
        <div className="mt-0.5 text-ink-faint tnum">{weekLabelLong(week)}</div>
        <div className="mt-1 flex justify-between gap-4 text-ink-muted">
          <span>Projected cover</span>
          <span className="tnum text-ink">{weeks(row.endingCoverage)}</span>
        </div>
        <div className="flex justify-between gap-4 text-ink-muted">
          <span>Target</span>
          <span className="tnum text-ink">{weeks(row.targetWeeks)}</span>
        </div>
        <div
          className={
            status === 'Below target' ? 'text-neg' : status === 'Above target' ? 'text-pos' : 'text-ink-muted'
          }
        >
          {statusLabel(status, gap)}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-edge-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-xl">
      <div className="mb-1.5 text-ink-faint tnum">{weekLabelLong(week)}</div>
      <div className="flex flex-col gap-1">
        {rows.map((row) => {
          const status = coverStatus(row.endingCoverage, row.targetWeeks)
          const gap = row.targetWeeks - row.endingCoverage
          return (
            <div key={row.line} className="flex items-baseline gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: LINE_COLORS[row.line] }} />
              <span className="min-w-[7.5rem] text-ink">{LINE_LABELS[row.line]}</span>
              <span className="tnum text-ink">
                {weeks(row.endingCoverage)}
                <span className="text-ink-faint"> / {weeks(row.targetWeeks)}</span>
              </span>
              <span
                className={
                  status === 'Below target'
                    ? 'ml-auto text-neg'
                    : status === 'Above target'
                      ? 'ml-auto text-pos'
                      : 'ml-auto text-ink-faint'
                }
              >
                {statusLabel(status, gap)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function statusLabel(status: ReturnType<typeof coverStatus>, gap: number): string {
  if (status === 'Below target') return `${weeksPhrase(gap, 1)} below`
  if (status === 'Above target') return 'Above target'
  return 'At target'
}

export function ChartSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-hidden>
      <div className="mb-1.5 flex shrink-0 flex-col gap-1">
        <h2 className="text-[15px] font-medium text-ink">Line-level cover vs target</h2>
        <Bone className="h-3 w-64" />
      </div>
      <Bone className="min-h-0 flex-1 rounded-lg" />
      <Bone className="mt-2 h-3 w-2/3 shrink-0" />
    </div>
  )
}
