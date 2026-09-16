'use client'

/**
 * Part 1 made visible: what nine inconsistent files were turned into, where
 * Redwheel actually stands today, and every judgement call made along the way.
 */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHANNELS, CHANNEL_LABELS, LINE_LABELS, type Channel } from '@/lib/domain'
import type { DataNote } from '@/lib/domain'
import type { HistoryPoint, SourceSummary } from '@/lib/planning-inputs'
import { compactUnits, units, weeks } from '@/lib/format'
import type { BuildPlan } from '@/lib/engine'
import { Badge, Card, CardTitle, cx } from '@/components/ui/primitives'

const CHANNEL_COLORS: Record<Channel, string> = {
  dtc: '#7c87f5',
  dealer: '#56c7e6',
  commercial: '#3fcf8e',
}

export function OpeningPosition({
  plan,
  dealerStock,
}: {
  plan: BuildPlan
  dealerStock: Record<string, number>
}) {
  const firstWeek = plan.weeks[0]
  const rows = plan.rows
    .filter((row) => row.weekStart === firstWeek)
    .map((row) => ({
      ...row,
      dealerOnHand: dealerStock[row.sku] ?? 0,
    }))
    .sort((a, b) => a.startingCoverage - a.targetWeeks - (b.startingCoverage - b.targetWeeks))

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardTitle hint="Sorted by distance below target">Where Redwheel stands today</CardTitle>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr>
              {['SKU', 'Line', 'Size', 'Plant stock', 'Dealer floors', 'Owed', 'Cover', 'Target', 'Gap'].map(
                (header, index) => (
                  <th
                    key={header}
                    className={cx(
                      'border-y border-edge bg-surface px-3 py-2 font-normal whitespace-nowrap text-ink-faint',
                      index < 3 ? 'text-left' : 'text-right',
                    )}
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const gap = row.startingCoverage - row.targetWeeks
              return (
                <tr key={row.sku} className="hover:bg-hover">
                  <td className="border-b border-edge px-3 py-1.5 tnum text-ink">{row.sku}</td>
                  <td className="border-b border-edge px-3 py-1.5 text-ink-muted">{LINE_LABELS[row.line]}</td>
                  <td className="border-b border-edge px-3 py-1.5 text-ink-muted">{row.size}</td>
                  <td className="border-b border-edge px-3 py-1.5 text-right tnum text-ink-muted">
                    {units(row.startingInventory)}
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-right tnum text-accent">
                    {row.dealerOnHand > 0 ? units(row.dealerOnHand) : '—'}
                  </td>
                  <td
                    className={cx(
                      'border-b border-edge px-3 py-1.5 text-right tnum',
                      row.startingBacklog > 0 ? 'text-neg' : 'text-ink-faint',
                    )}
                  >
                    {row.startingBacklog > 0 ? units(row.startingBacklog) : '—'}
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-right tnum text-ink">
                    {weeks(row.startingCoverage)}
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-right tnum text-ink-faint">
                    {row.targetWeeks}w
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-right">
                    <Badge tone={gap >= 0 ? 'positive' : gap > -5 ? 'warning' : 'negative'}>
                      {weeks(gap)}
                    </Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-[11.5px] leading-relaxed text-ink-faint">
        Cover is negative where unfulfilled orders exceed Redwheel stock on hand. Dealer floor stock is
        listed separately: it has already been sold and is not available to the plant. Dealer-channel
        forecast still counts as demand.
      </p>
    </Card>
  )
}

export function SourceData({ sources, history }: { sources: SourceSummary[]; history: HistoryPoint[] }) {
  const months = [...new Set(history.map((point) => point.month))].sort()
  const chartData = months.map((month) => {
    const point: Record<string, string | number> = { month }
    for (const channel of CHANNELS) {
      point[channel] = history
        .filter((item) => item.month === month && item.channel === channel)
        .reduce((total, item) => total + item.units, 0)
    }
    return point
  })

  const totalRows = sources.reduce((total, source) => total + source.rows, 0)

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardTitle hint={`${units(totalRows)} rows across 9 files`}>What Redwheel sent</CardTitle>
        </div>
        <div className="overflow-auto">
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                {['File', 'Rows', 'Became', 'Had to be reconciled'].map((header, index) => (
                  <th
                    key={header}
                    className={cx(
                      'border-y border-edge bg-surface px-3 py-2 font-normal whitespace-nowrap text-ink-faint',
                      index === 1 ? 'text-right' : 'text-left',
                    )}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.file} className="hover:bg-hover">
                  <td className="border-b border-edge px-3 py-1.5 font-mono text-[11.5px] text-ink">
                    {source.file}
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-right tnum text-ink-muted">
                    {units(source.rows)}
                  </td>
                  <td className="border-b border-edge px-3 py-1.5 text-ink-muted">{source.becomes}</td>
                  <td className="border-b border-edge px-3 py-1.5 text-[11.5px] text-ink-faint">
                    {source.quirk ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11.5px] leading-relaxed text-ink-faint">
          Three date formats, three casing conventions and three ways of writing a boolean, all resolved
          into one schema before the engine sees any of it.
        </p>
      </Card>

      <Card>
        <CardTitle hint="Twelve months of order history">Demand as it arrived</CardTitle>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#272a32" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(month: string) => month.slice(5)}
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
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-edge-strong bg-raised px-2.5 py-2 text-[11.5px] shadow-xl">
                      <div className="mb-1 text-ink-faint tnum">{String(label)}</div>
                      {payload.map((item) => (
                        <div key={String(item.dataKey)} className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: CHANNEL_COLORS[item.dataKey as Channel] }}
                          />
                          <span className="text-ink-muted">{CHANNEL_LABELS[item.dataKey as Channel]}</span>
                          <span className="ml-auto tnum text-ink">{units(Number(item.value))}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              {CHANNELS.map((channel) => (
                <Bar
                  key={channel}
                  dataKey={channel}
                  stackId="channel"
                  fill={CHANNEL_COLORS[channel]}
                  maxBarSize={22}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {CHANNELS.map((channel) => (
            <span key={channel} className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: CHANNEL_COLORS[channel] }}
              />
              {CHANNEL_LABELS[channel]}
            </span>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function Assumptions({ notes }: { notes: DataNote[] }) {
  const judgements = notes.filter((note) => note.severity === 'warning')
  const observations = notes.filter((note) => note.severity !== 'warning')

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardTitle hint={`${judgements.length} calls`}>Judgement calls</CardTitle>
        <p className="mb-4 text-[12px] leading-relaxed text-ink-faint">
          Places where the brief did not say, so a decision was made. Each of these could reasonably go
          the other way, and each is a question worth asking Redwheel.
        </p>
        <NoteList notes={judgements} tone="warning" />
      </Card>
      <Card>
        <CardTitle hint={`${observations.length} findings`}>What the files said</CardTitle>
        <p className="mb-4 text-[12px] leading-relaxed text-ink-faint">
          Observations recorded while normalising, kept separate from the judgement calls above.
        </p>
        <NoteList notes={observations} tone="neutral" />
      </Card>
    </div>
  )
}

function NoteList({ notes, tone }: { notes: DataNote[]; tone: 'warning' | 'neutral' }) {
  return (
    <ul className="flex flex-col gap-3">
      {notes.map((note, index) => (
        <li key={`${note.source}-${index}`} className="flex gap-3">
          <span
            className={cx(
              'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
              tone === 'warning' ? 'bg-warn' : 'bg-ink-faint',
            )}
          />
          <div>
            <div className="font-mono text-[11px] text-ink-faint">{note.source}</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">{note.message}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
