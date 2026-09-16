'use client'

/**
 * Everything the planner can change, in one row.
 *
 * Product group and date range are the two filters the whole screen reads from.
 * The assumptions behind the plan sit behind a third pill so they are one click
 * away without taking a column of the screen.
 */
import { LINES, LINE_LABELS } from '@/lib/domain'
import { monthLabel, weekLabelLong } from '@/lib/format'
import type { Scope } from '@/lib/engine/scope'
import { Popover } from '@/components/ui/popover'
import { cx } from '@/components/ui/primitives'

export function ProductGroupFilter({
  scope,
  onChange,
}: {
  scope: Scope
  onChange: (scope: Scope) => void
}) {
  return (
    <Popover
      label={
        <>
          <span className="text-ink-faint">Group</span>
          <span className="text-ink">{scope === 'all' ? 'All lines' : LINE_LABELS[scope]}</span>
        </>
      }
      width={230}
    >
      {(close) => (
        <div className="flex flex-col gap-0.5">
          <Option
            label="All lines"
            hint="Four lines, ten SKUs"
            active={scope === 'all'}
            onClick={() => {
              onChange('all')
              close()
            }}
          />
          {LINES.map((line) => (
            <Option
              key={line}
              label={LINE_LABELS[line]}
              active={scope === line}
              onClick={() => {
                onChange(line)
                close()
              }}
            />
          ))}
        </div>
      )}
    </Popover>
  )
}

export interface RangeOption {
  label: string
  weeks: number
}

export const RANGE_OPTIONS: RangeOption[] = [
  { label: 'First 13 weeks', weeks: 13 },
  { label: 'First 26 weeks', weeks: 26 },
  { label: 'First year', weeks: 52 },
  { label: 'Full horizon', weeks: Number.POSITIVE_INFINITY },
]

export function DateRangeFilter({
  weeks,
  allWeeks,
  rangeWeeks,
  onChange,
}: {
  /** The weeks currently visible. */
  weeks: string[]
  allWeeks: string[]
  rangeWeeks: number
  onChange: (weeks: number) => void
}) {
  const first = weeks[0] ?? allWeeks[0]
  const last = weeks.at(-1) ?? allWeeks.at(-1)!

  return (
    <Popover
      label={
        <>
          <span className="text-ink-faint">Range</span>
          <span className="text-ink tnum">
            {monthLabel(first)} — {monthLabel(last)}
          </span>
        </>
      }
      width={250}
    >
      {(close) => (
        <div className="flex flex-col gap-0.5">
          {RANGE_OPTIONS.map((option) => (
            <Option
              key={option.label}
              label={option.label}
              hint={
                option.weeks === Number.POSITIVE_INFINITY
                  ? `${allWeeks.length} weeks to ${weekLabelLong(allWeeks.at(-1)!)}`
                  : undefined
              }
              active={rangeWeeks === option.weeks}
              onClick={() => {
                onChange(option.weeks)
                close()
              }}
            />
          ))}
          <p className="mt-1.5 border-t border-edge pt-2 text-[11px] leading-relaxed text-ink-faint">
            The range filters the table, shades the chart, and scopes SKU-week target attainment.
            Snapshot cover, backlog, utilization, and end-of-horizon line status use the full plan.
          </p>
        </div>
      )}
    </Popover>
  )
}

function Option({
  label,
  hint,
  active,
  onClick,
}: {
  label: string
  hint?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex flex-col rounded-lg px-2.5 py-1.5 text-left transition-colors',
        active ? 'bg-accent-soft' : 'hover:bg-hover',
      )}
    >
      <span className={cx('text-[12.5px]', active ? 'text-ink' : 'text-ink-muted')}>{label}</span>
      {hint && <span className="text-[11px] text-ink-faint tnum">{hint}</span>}
    </button>
  )
}
