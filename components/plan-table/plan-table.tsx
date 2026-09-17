'use client'

/**
 * The weekly build plan.
 *
 * Columns read left to right in decision order: starting cover (the ranking
 * input), what the SKU asked for, what the line allocated, then projected cover
 * after that allocation. Clicking a row opens the derivation.
 *
 * Weeks collapse so a long horizon stays scannable. Selecting a SKU opens its
 * week; that week can still be collapsed while the drawer stays open.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, Fragment } from 'react'
import { percent, units, weekLabel, weeks, yearOf } from '@/lib/format'
import { NO_DIFF, type PlanDiff } from '@/lib/engine/diff'
import { Badge, Bone, cx } from '@/components/ui/primitives'
import { InfoTip } from '@/components/ui/info-tip'
import { ChevronDownIcon, ChevronRightIcon } from '@/components/ui/icons'
import { projectedCoverCopy, weekTargetSummary } from '@/lib/engine/status'
import type { TableRow } from './rows'

const COLUMNS: {
  label: string
  align: 'left' | 'right'
  hint?: string
  hideOnMobile?: boolean
  tip?: boolean
}[] = [
  { label: 'Week', align: 'left' },
  { label: 'SKU', align: 'left' },
  { label: 'Line', align: 'left', hideOnMobile: true },
  {
    label: 'Forecast',
    align: 'right',
    hint: 'Forecast demand the plant must cover this week, including dealer-channel forecast. Dealer-held inventory does not reduce this.',
    hideOnMobile: true,
  },
  {
    label: 'Starting inv',
    align: 'right',
    hint: 'Redwheel plant stock at the start of the week. Dealer-held inventory has already been sold and is not included.',
    hideOnMobile: true,
  },
  { label: 'Backlog', align: 'right', hint: 'Units already owed to customers', hideOnMobile: true },
  {
    label: 'Starting cover',
    align: 'right',
    hint: "Cover at the beginning of the allocation decision, before this week's planned production.",
    tip: true,
  },
  {
    label: 'Build needed',
    align: 'right',
    hint: 'Units this SKU needs this week to reach target cover',
    hideOnMobile: true,
  },
  { label: 'Planned build', align: 'right', hint: "Units allocated after the line's capacity was divided" },
  {
    label: 'Capacity',
    align: 'right',
    hint: 'Weekly ceiling for this line, shared across its sizes',
    hideOnMobile: true,
  },
  { label: 'Ending inv', align: 'right', hint: 'Stock on hand at the end of the week', hideOnMobile: true },
  {
    label: 'Projected cover',
    align: 'right',
    hint: "Expected cover after this week's demand and planned production.",
    tip: true,
  },
]

const COLUMN_COUNT = COLUMNS.length

export function PlanTable({
  rows,
  selectedKey,
  onSelect,
  revealRequest = 0,
  diff = NO_DIFF,
}: {
  rows: TableRow[]
  selectedKey: string | null
  onSelect: (row: TableRow | null) => void
  /** Increment to reveal the selection again even when its key has not changed. */
  revealRequest?: number
  /** Which builds and cover figures the last run moved. */
  diff?: PlanDiff
}) {
  const groups = useMemo(() => groupByWeek(rows), [rows])
  const focusWeek =
    rows.find((row) => row.key === selectedKey)?.weekStart ?? groups[0]?.weekStart ?? null

  // Overrides against the default (only the focused week open). Missing → default.
  const [weekOpen, setWeekOpen] = useState<Record<string, boolean>>({})
  const selectedRowRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    if (selectedKey) {
      const weekStart = rows.find((row) => row.key === selectedKey)?.weekStart
      if (weekStart) setWeekOpen((previous) => ({ ...previous, [weekStart]: true }))
    }
    selectedRowRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [selectedKey, revealRequest, rows])

  if (rows.length === 0) {
    return (
      <div className="px-5 py-16 text-center text-[13px] text-ink-faint">
        No weeks in the selected range.
      </div>
    )
  }

  function isWeekOpen(weekStart: string): boolean {
    if (weekStart in weekOpen) return weekOpen[weekStart]
    return weekStart === focusWeek
  }

  function toggleWeek(weekStart: string) {
    setWeekOpen((previous) => ({
      ...previous,
      [weekStart]: !isWeekOpen(weekStart),
    }))
  }

  function expandAll() {
    setWeekOpen(Object.fromEntries(groups.map((group) => [group.weekStart, true])))
  }

  function collapseAll() {
    setWeekOpen(Object.fromEntries(groups.map((group) => [group.weekStart, false])))
  }

  const openCount = groups.filter((group) => isWeekOpen(group.weekStart)).length
  const allOpen = openCount === groups.length
  const allClosed = openCount === 0

  return (
    <table className="w-full border-separate border-spacing-0 text-[12.5px]">
      <thead className="sticky top-0 z-10">
        <tr>
          <th
            colSpan={COLUMNS.length + 1}
            className="border-b border-edge bg-surface px-3 py-1.5 text-left font-normal"
          >
            <div className="flex items-center gap-2.5 text-[11.5px]">
              <button
                type="button"
                onClick={expandAll}
                disabled={allOpen}
                className="text-ink-faint transition-colors hover:text-ink disabled:cursor-default disabled:text-ink-faint/50"
              >
                Expand all
              </button>
              <span className="text-edge-strong">·</span>
              <button
                type="button"
                onClick={collapseAll}
                disabled={allClosed}
                className="text-ink-faint transition-colors hover:text-ink disabled:cursor-default disabled:text-ink-faint/50"
              >
                Collapse all
              </button>
            </div>
          </th>
        </tr>
        <tr>
          {COLUMNS.map((column) => (
            <th
              key={column.label}
              title={column.tip ? undefined : column.hint}
              className={cx(
                'border-b border-edge bg-surface px-3 py-2 font-normal whitespace-nowrap text-ink-faint',
                column.align === 'right' ? 'text-right' : 'text-left',
                column.hideOnMobile && 'hidden sm:table-cell',
              )}
            >
              {column.tip && column.hint ? (
                <span className={cx('inline-flex items-center gap-1', column.align === 'right' && 'justify-end')}>
                  {column.label}
                  <InfoTip text={column.hint} />
                </span>
              ) : (
                column.label
              )}
            </th>
          ))}
          <th className="border-b border-edge bg-surface px-2 py-2 text-right font-normal text-ink-faint">
            <span className="sr-only">Open details</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const open = isWeekOpen(group.weekStart)
          if (!open) {
            return (
              <WeekSummaryRow
                key={group.weekStart}
                weekStart={group.weekStart}
                rows={group.rows}
                open={false}
                onToggle={() => toggleWeek(group.weekStart)}
              />
            )
          }

          return (
            <Fragment key={group.weekStart}>
              <WeekSummaryRow
                weekStart={group.weekStart}
                rows={group.rows}
                open
                onToggle={() => toggleWeek(group.weekStart)}
              />
              {group.rows.map((row) => {
                const isSelected = row.key === selectedKey
                const shorted = row.desiredBuild > row.build
                const projected = projectedCoverCopy(row)

                return (
                  <tr
                    key={row.key}
                    ref={isSelected ? selectedRowRef : undefined}
                    onClick={() => {
                      if (isSelected) {
                        onSelect(null)
                        return
                      }
                      setWeekOpen((previous) => ({ ...previous, [row.weekStart]: true }))
                      onSelect(row)
                    }}
                    aria-selected={isSelected}
                    className={cx(
                      'group cursor-pointer transition-colors',
                      isSelected ? 'bg-accent-soft' : 'hover:bg-hover',
                    )}
                  >
                    <Cell weekGroup={false}>
                      <span>&nbsp;</span>
                    </Cell>

                    <Cell weekGroup={false}>
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span>
                          <span className="tnum text-ink">{row.sku}</span>
                          <span className="ml-1.5 text-[11px] text-ink-faint">{row.size}</span>
                        </span>
                        {row.prioritized && row.priorityTip && (
                          <Badge tone="accent" title={row.priorityTip}>
                            Prioritized
                          </Badge>
                        )}
                      </span>
                    </Cell>

                    <Cell weekGroup={false} hideOnMobile>
                      <span className="text-[11.5px] text-ink-faint">{row.lineLabel}</span>
                    </Cell>

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className="tnum text-ink-muted">{units(row.forecast)}</span>
                    </Cell>

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className="tnum text-ink-muted">{units(row.startingInventory)}</span>
                    </Cell>

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className={cx('tnum', row.startingBacklog > 0 ? (row.priorityBy === 'backlog' ? 'font-medium text-accent-bright' : 'text-neg') : 'text-ink-faint')}>
                        {row.startingBacklog > 0 ? units(row.startingBacklog) : '—'}
                      </span>
                    </Cell>

                    <Cell weekGroup={false} align="right">
                      <span className={cx('tnum', row.priorityBy === 'starting-cover' ? 'font-medium text-accent-bright' : 'text-ink-muted')}>
                        {weeks(row.startingCoverage, 2)}
                      </span>
                    </Cell>

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className="tnum text-ink-muted">
                        {row.desiredBuild > 0 ? units(row.desiredBuild) : '—'}
                      </span>
                    </Cell>

                    <Cell weekGroup={false} align="right">
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

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className="tnum text-ink-faint">{units(row.capacity)}</span>
                    </Cell>

                    <Cell weekGroup={false} align="right" hideOnMobile>
                      <span className="tnum text-ink-muted">{units(row.endingInventory)}</span>
                    </Cell>

                    <Cell weekGroup={false} align="right">
                      <span
                        className={cx(
                          'inline-flex flex-col items-end gap-0.5',
                          diff.cover.has(row.key) && 'changed -mx-0.5 px-0.5',
                        )}
                      >
                        <span className="tnum font-medium text-ink">{projected.primary}</span>
                        {projected.secondary && (
                          <span className="text-[10.5px] text-ink-faint tnum">{projected.secondary}</span>
                        )}
                      </span>
                    </Cell>

                    <Cell weekGroup={false} align="right" tight>
                      <span
                        className={cx(
                          'inline-flex items-center gap-0.5 text-[11px] transition-colors',
                          isSelected ? 'text-accent-bright' : 'text-ink-faint group-hover:text-ink-muted',
                        )}
                      >
                        <span className="hidden sm:inline">Details</span>
                        <ChevronRightIcon />
                      </span>
                    </Cell>
                  </tr>
                )
              })}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function groupByWeek(rows: TableRow[]): { weekStart: string; rows: TableRow[] }[] {
  const groups: { weekStart: string; rows: TableRow[] }[] = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.weekStart === row.weekStart) last.rows.push(row)
    else groups.push({ weekStart: row.weekStart, rows: [row] })
  }
  return groups
}

function WeekToggle({
  weekStart,
  open,
  onToggle,
}: {
  weekStart: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      aria-expanded={open}
      className="inline-flex w-full cursor-pointer items-center gap-1 py-0.5 text-left text-ink transition-colors hover:text-ink"
    >
      {open ? (
        <ChevronDownIcon className="shrink-0 text-ink-faint" />
      ) : (
        <ChevronRightIcon className="shrink-0 text-ink-faint" />
      )}
      <span className="tnum">
        {weekLabel(weekStart)}
        <span className="ml-1 text-ink-faint">{`'${yearOf(weekStart).slice(2)}`}</span>
      </span>
    </button>
  )
}

function WeekSummaryRow({
  weekStart,
  rows,
  open,
  onToggle,
}: {
  weekStart: string
  rows: TableRow[]
  open: boolean
  onToggle: () => void
}) {
  const summary = weekTargetSummary(rows)

  return (
    <tr
      onClick={onToggle}
      className="cursor-pointer select-none transition-colors hover:bg-hover"
    >
      <Cell weekGroup>
        <WeekToggle weekStart={weekStart} open={open} onToggle={onToggle} />
      </Cell>
      <td
        colSpan={COLUMN_COUNT}
        className="cursor-pointer border-t border-edge-strong px-3 py-[6px] text-[11.5px] text-ink-faint"
      >
        <span>{summary.primary}</span>
        {summary.secondary && (
          <>
            <span className="mx-1.5 text-edge-strong">·</span>
            <span className="text-warn">{summary.secondary}</span>
          </>
        )}
      </td>
    </tr>
  )
}

function Cell({
  children,
  align = 'left',
  weekGroup,
  tight = false,
  hideOnMobile = false,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  /** Stronger rule between weeks; hairline within a week. */
  weekGroup: boolean
  tight?: boolean
  hideOnMobile?: boolean
}) {
  return (
    <td
      className={cx(
        'whitespace-nowrap',
        tight ? 'px-2 py-[5px]' : 'px-3 py-[5px]',
        align === 'right' ? 'text-right' : 'text-left',
        weekGroup ? 'cursor-pointer border-t border-edge-strong' : 'border-t border-edge/50',
        hideOnMobile && 'hidden sm:table-cell',
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
        <span className="tnum text-ink-muted">{units(rows.length)}</span> SKU-weeks
      </span>
      <span>
        Total build need <span className="tnum text-ink-muted">{units(asked)}</span>
      </span>
      <span>
        Planned production <span className="tnum text-ink">{units(build)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        Selected range utilization{' '}
        <span className="tnum text-ink-muted">{capacity > 0 ? percent(build / capacity) : '—'}</span>
        <InfoTip
          text={`${units(build)} planned of ${units(capacity)} capacity in the weeks on screen. The KPI is overall capacity utilization for the full horizon.`}
        />
      </span>
      <span title="SKU-weeks where planned build is below build needed">
        Capacity-constrained SKU-weeks{' '}
        <span className={cx('tnum', shortRows > 0 ? 'text-warn' : 'text-pos')}>{units(shortRows)}</span>
      </span>
      {diff.hasPrevious && (
        <span title="SKU-weeks whose planned build moved in the last run">
          Builds changed{' '}
          <span className={cx('tnum', changedRows > 0 ? 'text-accent' : 'text-ink-muted')}>{units(changedRows)}</span>
        </span>
      )}
      <span className="ml-auto">Select a row for the arithmetic</span>
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
                column.hideOnMobile && 'hidden sm:table-cell',
              )}
            >
              {column.label}
            </th>
          ))}
          <th className="border-b border-edge bg-surface px-2 py-2" />
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
                  index === 0 ? 'border-t border-edge-strong' : 'border-t border-edge/50',
                  column.hideOnMobile && 'hidden sm:table-cell',
                )}
              >
                <Bone className={cx('inline-block h-3', column.align === 'right' ? 'w-10' : 'w-16')} />
              </td>
            ))}
            <td className={cx('px-2 py-[7px]', index === 0 ? 'border-t border-edge-strong' : 'border-t border-edge/50')}>
              <Bone className="ml-auto inline-block h-3 w-10" />
            </td>
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
