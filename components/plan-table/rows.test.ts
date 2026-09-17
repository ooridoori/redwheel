// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPlanningInputs } from '../../lib/load-inputs'
import { runAllocation } from '../../lib/engine'
import { DEFAULT_POLICY } from '../../lib/engine/policy'
import { PlanTable } from './plan-table'
import { buildTableRows, resolveSelection } from './rows'

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
