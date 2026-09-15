'use client'

/**
 * Units built against the ceiling, week by week. Supporting evidence rather
 * than the headline: it shows effort, where the cover chart shows outcome.
 */
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compactUnits, monthLabel, percent, units, weekLabelLong } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { Card, CardTitle } from '@/components/ui/primitives'

export function CapacityChart({ plan }: { plan: BuildPlan }) {
  const data = plan.weeks.map((week) => {
    const entries = plan.lineWeeks.filter((item) => item.weekStart === week)
    const build = entries.reduce((total, item) => total + item.build, 0)
    const capacity = entries.reduce((total, item) => total + item.capacity, 0)
    return {
      week,
      build,
      capacity,
      idle: Math.max(0, capacity - build),
      utilization: capacity === 0 ? 0 : build / capacity,
    }
  })

  return (
    <Card>
      <CardTitle hint={`${percent(plan.kpis.utilization, 1)} of capacity used`}>
        Units built against capacity
      </CardTitle>
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#272a32" vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={monthLabel}
              minTickGap={40}
              stroke="#6e7480"
              fontSize={10.5}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={compactUnits}
              stroke="#6e7480"
              fontSize={10.5}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-lg border border-edge-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-xl">
                    <div className="mb-1 text-ink-faint tnum">{weekLabelLong(String(label))}</div>
                    <Row label="Built" value={units(point.build)} color="#7c87f5" />
                    <Row label="Capacity" value={units(point.capacity)} color="#6e7480" />
                    <Row label="Used" value={percent(point.utilization, 1)} color="#3fcf8e" />
                  </div>
                )
              }}
            />
            <Bar dataKey="build" stackId="capacity" fill="#7c87f5" maxBarSize={6} isAnimationActive={false} />
            <Bar dataKey="idle" stackId="capacity" fill="#23262e" maxBarSize={6} isAnimationActive={false} />
            <Line
              type="monotone"
              dataKey="capacity"
              stroke="#4a4f5e"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Filled bars are units built, faint bars the ceiling left unused. Capacity is not flat — the carbon
        mountain line more than doubles over the horizon, which is why the plan can catch up at all.
      </p>
    </Card>
  )
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-ink-muted">{label}</span>
      <span className="ml-auto tnum text-ink">{value}</span>
    </div>
  )
}
