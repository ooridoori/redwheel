'use client'

/**
 * The weekly build plan.
 *
 * Columns read left to right in the order the arithmetic happens: what we hold,
 * what we owe, what the target asks for, what the SKU requested, what the line
 * could give it, and where that leaves us. Clicking a row opens the derivation.
 */
import { percent, units, weekLabel, weeks, yearOf } from '@/lib/format'
import { NO_DIFF, type PlanDiff } from '@/lib/engine/diff'
import { Badge, Bone, cx } from '@/components/ui/primitives'
import { InfoTip } from '@/components/ui/info-tip'
import type { TableRow } from './rows'

const COLUMNS: { label: string; align: 'left' | 'right'; hint?: string }[] = [
  { label: 'Week', align: 'left' },
  { label: 'SKU', align: 'left' },
  { label: 'Line', align: 'left' },
  { label: 'Forecast', align: 'right', hint: 'Demand the factory must cover this week' },
  { label: 'Starting inv', align: 'right', hint: 'Stock on hand at the start of the week' },
  { label: 'Backlog', align: 'right', hint: 'Units already owed to customers' },
  { label: 'Target cover', align: 'right', hint: 'Required weeks of cover' },
  { label: 'Build needed', align: 'right', hint: 'Units this SKU needs this week to reach target cover' },
  { label: 'Planned build', align: 'right', hint: "Units allocated after the line's capacity was divided" },
  { label: 'Capacity', align: 'right', hint: 'Weekly ceiling for this line, shared across its sizes' },
  { label: 'Ending inv', align: 'right', hint: 'Stock on hand at the end of the week' },
  { label: 'Ending cover', align: 'right', hint: 'Weeks of cover at week end, against target cover' },
]

export function PlanTable({
  rows,
  selectedKey,
  onSelect,
  diff = NO_DIFF,
}: {
  rows: TableRow[]
  selectedKey: string | null
  onSelect: (row: TableRow) => void
  /** Which builds and cover figures the last run moved. */
  diff?: PlanDiff
}) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-16 text-center text-[13px] text-ink-faint">
        No weeks in the selected range.
      </div>
    )
  }

  return (
    <table className="w-full border-separate border-spacing-0 text-[12.5px]">
      <thead className="sticky top-0 z-10">
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column.label}
              title={column.hint}
              className={cx(
                'border-b border-edge bg-surface px-3 py-2 font-normal whitespace-nowrap text-ink-faint',
                column.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          // The week is printed once per group and the group gets a top rule,
          // so several SKU rows read as one week.
          const isNewWeek = index === 0 || rows[index - 1].weekStart !== row.weekStart
          const isSelected = row.key === selectedKey
          const shorted = row.desiredBuild > row.build

          return (
            <tr
              key={row.key}
              onClick={() => onSelect(row)}
              className={cx('cursor-pointer', isSelected ? 'bg-accent-soft' : 'hover:bg-hover')}
            >
              <Cell first={isNewWeek}>
                {isNewWeek ? (
                  <span className="tnum text-ink">
                    {weekLabel(row.weekStart)}
                    <span className="ml-1 text-ink-faint">{`'${yearOf(row.weekStart).slice(2)}`}</span>
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </Cell>

              <Cell first={isNewWeek}>
                <span className="tnum text-ink">{row.sku}</span>
                <span className="ml-1.5 text-[11px] text-ink-faint">{row.size}</span>
              </Cell>

              <Cell first={isNewWeek}>
                <span className="text-[11.5px] text-ink-faint">{row.lineLabel}</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="inline-flex items-center justify-end gap-1">
                  <span className="tnum text-ink-muted">{units(row.forecast)}</span>
                  {row.absorbedByDealers > 0 && (
                    <InfoTip
                      text={`${units(row.grossForecast)} total demand · ${units(row.absorbedByDealers)} covered by dealer stock · ${units(row.forecast)} remaining factory demand`}
                    />
                  )}
                </span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="tnum text-ink-muted">{units(row.startingInventory)}</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className={cx('tnum', row.startingBacklog > 0 ? 'text-neg' : 'text-ink-faint')}>
                  {row.startingBacklog > 0 ? units(row.startingBacklog) : '—'}
                </span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="tnum text-ink-faint">{row.targetWeeks}w</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="tnum text-ink-muted">{row.desiredBuild > 0 ? units(row.desiredBuild) : '—'}</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span
                  className={cx(
                    'tnum font-medium',
                    row.build > 0 ? 'text-ink' : 'text-ink-faint',
                    diff.build.has(row.key) && 'changed -mx-1 px-1',
                  )}
                  title={diff.build.has(row.key) ? 'Changed in the last run' : undefined}
                >
                  {units(row.build)}
                </span>
                {shorted && (
                  <span
                    className="ml-1 text-[10.5px] text-warn"
                    title={`${units(row.desiredBuild - row.build)} short of build needed. The line needed ${units(row.lineDesired)} against ${units(row.capacity)} capacity.`}
                  >
                    ▲
                  </span>
                )}
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="tnum text-ink-faint">{units(row.capacity)}</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className="tnum text-ink-muted">{units(row.endingInventory)}</span>
              </Cell>

              <Cell first={isNewWeek} align="right">
                <span className={cx('inline-block', diff.cover.has(row.key) && 'changed -mx-0.5 px-0.5')}>
                  <Badge
                    tone={row.atTarget ? 'positive' : row.endingCoverage < 0 ? 'negative' : 'warning'}
                    title={`${row.atTarget ? 'At' : 'Below'} ${row.targetWeeks}w target cover`}
                  >
                    {weeks(row.endingCoverage)}
                  </Badge>
                </span>
              </Cell>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Cell({
  children,
  align = 'left',
  first,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  first: boolean
}) {
  return (
    <td
      className={cx(
        'px-3 py-[5px] whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        first ? 'border-t border-edge' : 'border-t border-transparent',
      )}
    >
      {children}
    </td>
  )
}

/** Footer strip summarising the rows currently in view. */
export function PlanTableSummary({ rows, diff = NO_DIFF }: { rows: TableRow[]; diff?: PlanDiff }) {
  const build = rows.reduce((total, row) => total + row.build, 0)
  const asked = rows.reduce((total, row) => total + row.desiredBuild, 0)
  const shortRows = rows.filter((row) => row.desiredBuild > row.build).length
  // Counted over the visible rows, like every other figure in this strip.
  const changedRows = diff.hasPrevious ? rows.filter((row) => diff.build.has(row.key)).length : 0

  // Several SKU rows share one line's ceiling, so capacity is counted once per line-week.
  const capacity = [...new Map(rows.map((row) => [`${row.weekStart}|${row.line}`, row.capacity])).values()].reduce(
    (total, value) => total + value,
    0,
  )

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-t border-edge bg-surface px-4 py-2 text-[11.5px] text-ink-faint">
      <span>
        <span className="tnum text-ink-muted">{units(rows.length)}</span> rows
      </span>
      <span>
        Build needed <span className="tnum text-ink-muted">{units(asked)}</span>
      </span>
      <span>
        Planned build <span className="tnum text-ink">{units(build)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        Selected range utilization{' '}
        <span className="tnum text-ink-muted">{capacity > 0 ? percent(build / capacity) : '—'}</span>
        <InfoTip
          text={`${units(build)} planned of ${units(capacity)} capacity in the weeks on screen. The KPI is overall capacity utilization for the full horizon.`}
        />
      </span>
      <span title="Rows where planned build is below build needed">
        Shorted rows{' '}
        <span className={cx('tnum', shortRows > 0 ? 'text-warn' : 'text-pos')}>{units(shortRows)}</span>
      </span>
      {diff.hasPrevious && (
        <span title="Rows whose planned build moved in the last run">
          Builds changed{' '}
          <span className={cx('tnum', changedRows > 0 ? 'text-accent' : 'text-ink-muted')}>{units(changedRows)}</span>
        </span>
      )}
      <span className="ml-auto">Click a row to see the math</span>
    </div>
  )
}

export function PlanTableSkeleton() {
  return (
    <table className="w-full border-separate border-spacing-0 text-[12.5px]" aria-hidden>
      <thead className="sticky top-0 z-10">
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column.label}
              className={cx(
                'border-b border-edge bg-surface px-3 py-2 font-normal whitespace-nowrap text-ink-faint',
                column.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: 10 }, (_, index) => (
          <tr key={index}>
            {COLUMNS.map((column) => (
              <td
                key={column.label}
                className={cx(
                  'px-3 py-[7px]',
                  column.align === 'right' ? 'text-right' : 'text-left',
                  index === 0 ? 'border-t border-edge' : 'border-t border-transparent',
                )}
              >
                <Bone className={cx('inline-block h-3', column.align === 'right' ? 'w-10' : 'w-16')} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PlanTableSummarySkeleton() {
  return (
    <div className="flex shrink-0 items-center gap-6 border-t border-edge bg-surface px-4 py-2" aria-hidden>
      <Bone className="h-3 w-16" />
      <Bone className="h-3 w-24" />
      <Bone className="h-3 w-20" />
      <Bone className="h-3 w-28" />
      <Bone className="ml-auto h-3 w-40" />
    </div>
  )
}
