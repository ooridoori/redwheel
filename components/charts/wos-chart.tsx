'use client'

/**
 * The centrepiece: does projected cover reach target, and when.
 *
 * This is the one chart on the screen because it is the only one that proves
 * the engine did its job. Volume charts show effort; this shows outcome.
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
import { monthLabel, weekLabelLong } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { targetWeeksFor } from '@/lib/engine/policy'
import type { Scope } from '@/lib/engine/scope'
import { Bone } from '@/components/ui/primitives'

export const LINE_COLORS: Record<LineId, string> = {
  'road-base': '#7c87f5',
  'road-carbon': '#56c7e6',
  'mtb-base': '#3fcf8e',
  'mtb-carbon': '#e5a05b',
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

  const coverageByKey = new Map(
    plan.lineWeeks.map((entry) => [`${entry.weekStart}|${entry.line}`, entry.endingCoverage]),
  )

  const data = plan.weeks.map((week) => {
    const point: Record<string, string | number> = { week }
    for (const line of lines) {
      const cover = coverageByKey.get(`${week}|${line}`)
      if (cover !== undefined) point[line] = Number(cover.toFixed(2))
    }
    if (scope !== 'all') point.target = targetWeeksFor(plan.policy, scope, week)
    return point
  })

  const shadeFrom = visibleWeeks[0]
  const shadeTo = visibleWeeks.at(-1)
  const showShade = Boolean(shadeFrom && shadeTo && visibleWeeks.length < plan.weeks.length)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h2 className="text-[13px] font-medium text-ink">Projected cover vs target</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {lines.map((line) => (
            <span key={line} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: LINE_COLORS[line] }} />
              {LINE_LABELS[line]}
              <span className="text-ink-faint tnum">
                {targetWeeksFor(plan.policy, line, plan.weeks[0])}
                {targetWeeksFor(plan.policy, line, plan.weeks.at(-1)!) !==
                  targetWeeksFor(plan.policy, line, plan.weeks[0]) &&
                  `\u2192${targetWeeksFor(plan.policy, line, plan.weeks.at(-1)!)}`}
                w
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={140}>
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
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
              tickFormatter={(value: number) => `${value}w`}
              stroke="#6e7480"
              fontSize={10.5}
              tickLine={false}
              axisLine={false}
            />

            {showShade && (
              <ReferenceArea x1={shadeFrom} x2={shadeTo} fill="#7c87f5" fillOpacity={0.07} strokeOpacity={0} />
            )}

            {/* Zero is the line between holding stock and owing units. */}
            <ReferenceLine y={0} stroke="#4a4f5e" strokeWidth={1} />

            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-edge-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-xl">
                    <div className="mb-1 text-ink-faint tnum">{weekLabelLong(String(label))}</div>
                    <div className="flex flex-col gap-0.5">
                      {payload.map((item) => (
                        <div key={String(item.dataKey)} className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{
                              background:
                                item.dataKey === 'target'
                                  ? '#9ba1ad'
                                  : LINE_COLORS[item.dataKey as LineId],
                            }}
                          />
                          <span className="text-ink-muted">
                            {item.dataKey === 'target' ? 'Target' : LINE_LABELS[item.dataKey as LineId]}
                          </span>
                          <span className="ml-auto tnum text-ink">
                            {Number(item.value).toFixed(1)}w
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              }
            />

            {/* Animation is off throughout: the plan re-runs on demand, and a
                121-point line redrawing itself each time reads as a glitch. */}
            {scope !== 'all' && (
              <Line
                type="stepAfter"
                dataKey="target"
                stroke="#c9cdd6"
                strokeDasharray="5 3"
                strokeWidth={1.3}
                dot={false}
                isAnimationActive={false}
              />
            )}

            {lines.map((line) => (
              <Line
                key={line}
                type="monotone"
                dataKey={line}
                stroke={LINE_COLORS[line]}
                strokeWidth={1.7}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1.5 shrink-0 text-[10.5px] text-ink-faint">
        {scope === 'all'
          ? 'Each line against its own target cover. Below zero means more units are owed than held.'
          : 'Dashed line is target cover. Shaded band is the selected range in the table.'}
      </p>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-hidden>
      <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium text-ink">Projected cover vs target</h2>
        <div className="flex gap-3">
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-24" />
        </div>
      </div>
      <Bone className="min-h-0 flex-1 rounded-lg" />
      <Bone className="mt-2 h-3 w-2/3 shrink-0" />
    </div>
  )
}
