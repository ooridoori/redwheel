// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPlanningInputs } from '../../lib/load-inputs'
import { runAllocation } from '../../lib/engine'
import { DEFAULT_POLICY } from '../../lib/engine/policy'
import { PlanTable } from './plan-table'
import { buildTableRows, resolveSelection } from './rows'
import { projectedCoverCopy, skuStatus } from '../../lib/engine/status'

const inputs = loadPlanningInputs()
const plan = runAllocation(inputs)
const weeks26 = plan.weeks.slice(0, 26)
const rows26 = buildTableRows(plan, 'all', weeks26)
const rowsAll = buildTableRows(plan, 'all', plan.weeks)

afterEach(cleanup)

describe('drawer selection follows the latest plan, not a copied row', () => {
  it('closes when the selected SKU-week leaves the date range', () => {
    const farWeek = plan.weeks[50]
    const sku = plan.rows.find((row) => row.weekStart === farWeek)!.sku
    const selection = { sku, weekStart: farWeek }

    expect(resolveSelection(selection, rowsAll)?.sku).toBe(sku)
    expect(resolveSelection(selection, rows26)).toBeNull()
  })

  it('keeps a SKU-week that is still inside a narrower range', () => {
    const opening = rows26[0]
    const selection = { sku: opening.sku, weekStart: opening.weekStart }

    expect(resolveSelection(selection, rows26)?.key).toBe(opening.key)
    expect(resolveSelection(selection, buildTableRows(plan, 'all', plan.weeks.slice(0, 13)))?.sku).toBe(
      opening.sku,
    )
  })

  it('re-resolves the same SKU-week from a new scenario instead of keeping stale figures', () => {
    const opening = rows26[0]
    const selection = { sku: opening.sku, weekStart: opening.weekStart }
    const before = resolveSelection(selection, rows26)!

    const nextPlan = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'proportional' })
    const nextRows = buildTableRows(nextPlan, 'all', weeks26)
    const after = resolveSelection(selection, nextRows)!

    const engineRow = nextPlan.rows.find(
      (row) => row.sku === selection.sku && row.weekStart === selection.weekStart,
    )!
    expect(after.build).toBe(engineRow.build)
    expect(after.desiredBuild).toBe(engineRow.desiredBuild)
    expect(after.endingCoverage).toBe(engineRow.endingCoverage)
    expect(after.detail.row).toBe(engineRow)
    expect(after.detail.row).not.toBe(before.detail.row)
  })
})

describe('worst-off first ranks on starting cover, not projected cover', () => {
  it('marks RW-9304 as prioritized on Sep 14 Mountain — Carbon from starting cover', () => {
    const week = '2026-09-14'
    const carbon = plan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-carbon')
    const table = buildTableRows(plan, 'mtb-carbon', [week])
    const bySku = Object.fromEntries(table.map((row) => [row.sku, row]))

    const ranked = [...carbon].sort(
      (a, b) => a.startingCoverage - a.targetWeeks - (b.startingCoverage - b.targetWeeks),
    )
    expect(ranked[0].sku).toBe('RW-9304')
    expect(bySku['RW-9304'].prioritized).toBe(true)
    expect(bySku['RW-4418'].prioritized).toBe(false)
    expect(bySku['RW-6416'].prioritized).toBe(false)

    expect(bySku['RW-4418'].startingCoverage).toBeCloseTo(carbon.find((row) => row.sku === 'RW-4418')!.startingCoverage)
    expect(bySku['RW-4418'].endingCoverage).toBeLessThan(bySku['RW-4418'].startingCoverage)
    expect(bySku['RW-9304'].build).toBeGreaterThan(0)
    expect(bySku['RW-4418'].build).toBe(0)
  })

  it('does not treat a worse projected cover as the allocation reason', () => {
    const week = '2026-09-14'
    const table = buildTableRows(plan, 'mtb-carbon', [week])
    const medium = table.find((row) => row.sku === 'RW-4418')!
    const small = table.find((row) => row.sku === 'RW-9304')!

    expect(medium.endingCoverage).toBeLessThan(small.endingCoverage)
    expect(small.startingCoverage).toBeLessThan(medium.startingCoverage)
    expect(small.prioritized).toBe(true)
    expect(medium.prioritized).toBe(false)
  })
})

describe('owed customers first ranks on opening backlog', () => {
  const backlogPlan = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'backlog-first' })

  it('marks the SKU with the largest opening backlog on a constrained Mountain — Base week', () => {
    const week = '2026-09-07'
    const table = buildTableRows(backlogPlan, 'mtb-base', [week])
    const bySku = Object.fromEntries(table.map((row) => [row.sku, row]))
    const engine = backlogPlan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-base')
    const ranked = [...engine].sort((a, b) => b.startingBacklog - a.startingBacklog)

    expect(ranked[0].sku).toBe('RW-9901')
    expect(bySku['RW-9901'].prioritized).toBe(true)
    expect(bySku['RW-9901'].priorityBy).toBe('backlog')
    expect(bySku['RW-9901'].priorityTip).toMatch(/Largest outstanding backlog/)
    expect(bySku['RW-9324'].prioritized).toBe(false)
    expect(bySku['RW-9901'].startingBacklog).toBeGreaterThan(bySku['RW-9324'].startingBacklog)
    expect(bySku['RW-9901'].build).toBeGreaterThan(0)
  })

  it('does not use furthest-below-target language for the badge', () => {
    const table = buildTableRows(backlogPlan, 'mtb-base', ['2026-09-07'])
    const winner = table.find((row) => row.prioritized)!
    expect(winner.priorityTip).not.toMatch(/furthest below/)
    expect(winner.priorityBy).toBe('backlog')
  })
})

describe('weekly build plan distinguishes starting cover from projected cover', () => {
  it('labels the ranking input and the result, and marks the starting-cover winner', () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const week = '2026-09-14'
    const table = buildTableRows(plan, 'mtb-carbon', [week])
    const winner = table.find((row) => row.sku === 'RW-9304')!
    const medium = table.find((row) => row.sku === 'RW-4418')!
    const projected = projectedCoverCopy(medium)

    const view = render(
      createElement(PlanTable, {
        rows: table,
        selectedKey: winner.key,
        onSelect: () => undefined,
      }),
    )

    expect(view.getByText('Starting cover')).toBeTruthy()
    expect(view.getByText('Projected cover')).toBeTruthy()
    expect(view.queryByText('Ending cover')).toBeNull()
    expect(view.queryByText('Target cover')).toBeNull()
    expect(
      view.getByLabelText(
        "Cover at the beginning of the allocation decision, before this week's planned production.",
      ),
    ).toBeTruthy()
    expect(
      view.getByLabelText("Expected cover after this week's demand and planned production."),
    ).toBeTruthy()

    expect(view.getByText('Prioritized')).toBeTruthy()
    expect(view.getByText(projected.primary)).toBeTruthy()
    expect(view.getByText(projected.secondary!)).toBeTruthy()
    expect(view.queryByText(skuStatus(medium).label)).toBeNull()
  })
})

describe('selected table row visibility', () => {
  it('scrolls a newly selected SKU into view', () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const first = rows26[0]
    const affected = rows26.find((row) => row.key !== first.key)!

    const view = render(
      createElement(PlanTable, {
        rows: rows26,
        selectedKey: first.key,
        onSelect: () => undefined,
      }),
    )
    scrollIntoView.mockClear()

    view.rerender(
      createElement(PlanTable, {
        rows: rows26,
        selectedKey: affected.key,
        onSelect: () => undefined,
      }),
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })

    scrollIntoView.mockClear()
    view.rerender(
      createElement(PlanTable, {
        rows: rows26,
        selectedKey: affected.key,
        revealRequest: 1,
        onSelect: () => undefined,
      }),
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })
  })
})
