'use client'

/**
 * Part 3: one screen that answers what to build, whether we hit target, and why.
 *
 * Status in the KPI row, trend in the chart, the plan itself in the table, and
 * the explanation in the drawer. The engine is a pure function over data already
 * in the browser, so re-running it under a different assumption needs no server
 * round trip — which is what makes changing a target during a client call feel
 * instant.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import type { PlanningInputs } from '@/lib/planning-inputs'
import { runAllocation, DEFAULT_POLICY, type BuildPlan, type Policy } from '@/lib/engine'
import { diffPlans } from '@/lib/engine/diff'
import type { Scope } from '@/lib/engine/scope'
import { weekLabelLong } from '@/lib/format'
import { cx } from '@/components/ui/primitives'
import { RunIcon, SpinnerIcon } from '@/components/ui/icons'
import { AssumptionsPopover } from '@/components/controls/policy-popover'
import { DateRangeFilter, ProductGroupFilter } from '@/components/controls/top-bar-controls'
import { InsightPanel, InsightSkeleton, KpiRow, KpiRowSkeleton } from '@/components/overview/kpi-row'
import { ChartSkeleton, WosChart } from '@/components/charts/wos-chart'
import { PlanTable, PlanTableSkeleton, PlanTableSummary, PlanTableSummarySkeleton } from '@/components/plan-table/plan-table'
import { DerivationDrawer } from '@/components/plan-table/derivation-drawer'
import { buildTableRows, type TableRow } from '@/components/plan-table/rows'

export function Planner({ inputs }: { inputs: PlanningInputs }) {
  const [appliedPolicy, setAppliedPolicy] = useState<Policy>(DEFAULT_POLICY)
  const [draftPolicy, setDraftPolicy] = useState<Policy>(DEFAULT_POLICY)
  const [isRunning, setIsRunning] = useState(false)
  const runTimer = useRef<number>(0)

  const [scope, setScope] = useState<Scope>('all')
  const [rangeWeeks, setRangeWeeks] = useState(26)
  const [selected, setSelected] = useState<TableRow | null>(null)
  const [previousPlan, setPreviousPlan] = useState<BuildPlan | null>(null)

  const plan = useMemo(() => runAllocation(inputs, appliedPolicy), [inputs, appliedPolicy])
  const diff = useMemo(() => diffPlans(plan, previousPlan), [plan, previousPlan])

  const isDirty = useMemo(
    () => JSON.stringify(draftPolicy) !== JSON.stringify(appliedPolicy),
    [draftPolicy, appliedPolicy],
  )

  useEffect(() => () => window.clearTimeout(runTimer.current), [])

  /**
   * Show the skeletons first, then apply the new policy on the next frame so the
   * loader actually paints. The engine itself is ~5ms; we hold the loader for a
   * beat so "Run allocation" reads as a run rather than a silent repaint.
   */
  const run = () => {
    if (isRunning) return
    setIsRunning(true)
    setSelected(null)
    const previous = plan
    const nextPolicy = draftPolicy
    requestAnimationFrame(() => {
      const started = performance.now()
      setPreviousPlan(previous)
      setAppliedPolicy(nextPolicy)
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const holdFor = reduced ? 160 : 520
      runTimer.current = window.setTimeout(
        () => setIsRunning(false),
        Math.max(0, holdFor - (performance.now() - started)),
      )
    })
  }

  const visibleWeeks = useMemo(
    () => (rangeWeeks === Number.POSITIVE_INFINITY ? plan.weeks : plan.weeks.slice(0, rangeWeeks)),
    [plan.weeks, rangeWeeks],
  )

  const tableRows = useMemo(
    () => buildTableRows(plan, scope, visibleWeeks),
    [plan, scope, visibleWeeks],
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-edge px-5 py-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-[15px] font-medium tracking-[-0.01em]">Redwheel Production Planner</h1>
          <span className="text-[11.5px] text-ink-faint tnum">
            snapshot {weekLabelLong(inputs.asOf)} · {inputs.products.length} SKUs · 4 lines
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ProductGroupFilter
            scope={scope}
            onChange={(next) => {
              setScope(next)
              setSelected(null)
            }}
          />
          <DateRangeFilter
            weeks={visibleWeeks}
            allWeeks={plan.weeks}
            rangeWeeks={rangeWeeks}
            onChange={setRangeWeeks}
          />
          <AssumptionsPopover
            draft={draftPolicy}
            onChange={setDraftPolicy}
            onReset={() => setDraftPolicy(DEFAULT_POLICY)}
            isDirty={isDirty}
          />

          <button
            type="button"
            onClick={run}
            disabled={isRunning}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
              isDirty
                ? 'bg-accent text-canvas hover:bg-accent-bright'
                : 'border border-edge bg-raised text-ink-muted hover:text-ink',
              isRunning && 'opacity-80',
            )}
          >
            {isRunning ? <SpinnerIcon className="animate-spin" /> : <RunIcon />}
            {isRunning ? 'Running…' : 'Run allocation'}
          </button>

          <Link
            href="/data"
            className="ml-1 text-[11.5px] text-ink-faint underline decoration-dotted underline-offset-2 transition-colors hover:text-ink-muted"
          >
            Master data
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1" aria-busy={isRunning}>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
          {isRunning ? (
            <KpiRowSkeleton />
          ) : (
            <KpiRow plan={plan} previousPlan={previousPlan} scope={scope} />
          )}

          <div className="grid h-[264px] shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(340px,1.1fr)_1.8fr]">
            <section className="min-h-0 rounded-xl border border-edge bg-surface px-4 py-3">
              {isRunning ? <InsightSkeleton /> : <InsightPanel plan={plan} scope={scope} />}
            </section>
            <section className="min-h-0 rounded-xl border border-edge bg-surface px-4 py-3">
              {isRunning ? (
                <ChartSkeleton />
              ) : (
                <WosChart plan={plan} scope={scope} visibleWeeks={visibleWeeks} />
              )}
            </section>
          </div>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-edge bg-surface">
            <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-edge px-4 py-2.5">
              <h2 className="text-[13px] font-medium text-ink">Weekly build plan</h2>
              <span className="text-[11px] text-ink-faint tnum">
                {weekLabelLong(visibleWeeks[0])} — {weekLabelLong(visibleWeeks.at(-1)!)}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {isRunning ? (
                <PlanTableSkeleton />
              ) : (
                <PlanTable
                  rows={tableRows}
                  selectedKey={selected?.key ?? null}
                  onSelect={setSelected}
                  diff={diff}
                />
              )}
            </div>
            {isRunning ? <PlanTableSummarySkeleton /> : <PlanTableSummary rows={tableRows} diff={diff} />}
          </section>
        </div>

        {selected && (
          <DerivationDrawer
            row={selected}
            rule={plan.policy.rationing}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
