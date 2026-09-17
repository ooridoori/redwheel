// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadPlanningInputs } from '../../lib/load-inputs'
import { runAllocation, DEFAULT_POLICY } from '../../lib/engine'
import { percent, units, weeks } from '../../lib/format'
import { skuStatus } from '../../lib/engine/status'
import { DerivationDrawer } from './derivation-drawer'
import { buildTableRows } from './rows'

const inputs = loadPlanningInputs()
const plan = runAllocation(inputs)

afterEach(cleanup)

describe('worst-off first drawer tells the allocation in chronological order', () => {
  const week = '2026-09-14'
  const table = buildTableRows(plan, 'mtb-carbon', [week])
  const medium = table.find((row) => row.sku === 'RW-4418')!
  const small = table.find((row) => row.sku === 'RW-9304')!
  const lineRows = plan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-carbon')
  const capacity = medium.capacity

  it('explains why RW-9304 received capacity from starting cover, even from a sibling row', () => {
    const view = render(
      <DerivationDrawer
        row={medium}
        lineRows={lineRows}
        rule="worst-first"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.getByRole('heading', { name: /Why did RW-9304 get capacity/ })).toBeTruthy()
    expect(view.container.textContent).toMatch(/before this week's production is allocated/)
    expect(view.getByText('Before allocation')).toBeTruthy()
    expect(view.getByText('After allocation')).toBeTruthy()
    expect(view.getByText('Furthest below target')).toBeTruthy()
    expect(view.container.textContent).toContain(`${units(capacity)} units available`)
    expect(view.container.textContent).toContain(`${small.sku} receives ${units(small.build)}`)

    expect(view.getAllByText(weeks(small.startingCoverage, 2)).length).toBeGreaterThan(0)
    expect(view.getAllByText(weeks(medium.startingCoverage, 2)).length).toBeGreaterThan(0)
    expect(view.getAllByText(weeks(small.endingCoverage)).length).toBeGreaterThan(0)
    expect(view.getAllByText(weeks(medium.endingCoverage)).length).toBeGreaterThan(0)

    expect(view.container.querySelector('header')?.textContent).not.toContain(skuStatus(medium).label)
    expect(view.getByText('Below target')).toBeTruthy()
  })

  it('keeps the generic allocation list when the policy is not worst-off first', () => {
    const view = render(
      <DerivationDrawer
        row={medium}
        lineRows={lineRows}
        rule="proportional"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.getByRole('heading', { name: /Who gets the available capacity, and why/ })).toBeTruthy()
    expect(view.queryByText('Before allocation')).toBeNull()
    expect(view.queryByText('After allocation')).toBeNull()
  })
})

describe('proportional drawer shows the coverage share applied to each SKU', () => {
  const week = '2026-09-07'
  const propPlan = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'proportional' })
  const table = buildTableRows(propPlan, 'mtb-carbon', [week])
  const small = table.find((row) => row.sku === 'RW-9304')!
  const lineRows = propPlan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-carbon')
  const lineWeek = small.detail.lineWeek
  const share = percent(lineWeek.capacity / lineWeek.desiredBuild, 2)
  const needing = [...lineRows]
    .filter((row) => row.desiredBuild > 0)
    .sort((a, b) => b.desiredBuild - a.desiredBuild || a.sku.localeCompare(b.sku))

  it('names total required build, the coverage percent, and whole-unit shares that sum to capacity', () => {
    const view = render(
      <DerivationDrawer
        row={small}
        lineRows={lineRows}
        rule="proportional"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.getByText('Total required build')).toBeTruthy()
    expect(view.getAllByText(units(lineWeek.desiredBuild)).length).toBeGreaterThan(0)
    expect(view.getByText('Capacity covers')).toBeTruthy()
    expect(view.getAllByText(share).length).toBeGreaterThan(0)
    expect(view.container.textContent).toMatch(
      new RegExp(
        `Only ${units(lineWeek.capacity)} of the ${units(lineWeek.desiredBuild)} required units can be built this week`,
      ),
    )
    expect(view.container.textContent).toContain(
      `Proportional-to-need gives each SKU approximately ${share} of its required build`,
    )

    for (const row of needing) {
      expect(view.container.textContent).toContain(
        `${units(row.desiredBuild)} needed \u00d7 ${share} \u2192 ${units(row.build)} allocated`,
      )
    }

    const sum = needing.map((row) => units(row.build)).join(' + ')
    expect(view.container.textContent).toContain(`${sum} = ${units(lineWeek.capacity)}`)
    expect(needing.reduce((total, row) => total + row.build, 0)).toBe(lineWeek.capacity)
  })

  it('still shows the share math when only one SKU on the line has required build', () => {
    const week = '2026-09-14'
    const table = buildTableRows(propPlan, 'mtb-base', [week])
    const owed = table.find((row) => row.sku === 'RW-9901')!
    const surplus = table.find((row) => row.sku === 'RW-9324')!
    const lineRows = propPlan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-base')
    const lineWeek = owed.detail.lineWeek
    const share = percent(lineWeek.capacity / lineWeek.desiredBuild, 2)

    expect(owed.desiredBuild).toBeGreaterThan(0)
    expect(surplus.desiredBuild).toBe(0)
    expect(lineWeek.desiredBuild).toBe(owed.desiredBuild)

    const view = render(
      <DerivationDrawer
        row={owed}
        lineRows={lineRows}
        rule="proportional"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.container.textContent).not.toMatch(/Limited capacity was divided under the current allocation policy/)
    expect(view.container.textContent).toContain(
      `Only ${units(lineWeek.capacity)} of the ${units(lineWeek.desiredBuild)} required units can be built this week`,
    )
    expect(view.container.textContent).toContain(
      `Proportional-to-need gives each SKU approximately ${share} of its required build`,
    )
    expect(view.container.textContent).toContain(
      `${units(owed.desiredBuild)} needed \u00d7 ${share} \u2192 ${units(owed.build)} allocated`,
    )
    expect(view.container.textContent).toContain(`${units(owed.build)} = ${units(lineWeek.capacity)}`)
  })

  it('does not treat capacity coverage as the ranking story under worst-off first', () => {
    const defaultTable = buildTableRows(plan, 'mtb-carbon', [week])
    const row = defaultTable.find((entry) => entry.sku === 'RW-9304')!
    const view = render(
      <DerivationDrawer
        row={row}
        lineRows={plan.rows.filter((entry) => entry.weekStart === week && entry.line === 'mtb-carbon')}
        rule="worst-first"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.getByText('Total required build')).toBeTruthy()
    expect(view.getByText('Unmet need')).toBeTruthy()
    expect(view.queryByText('Capacity covers')).toBeNull()
    expect(view.container.textContent).not.toMatch(/Proportional-to-need/)
  })
})

describe('owed-customers-first drawer ranks on opening backlog', () => {
  const week = '2026-09-07'
  const backlogPlan = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'backlog-first' })
  const table = buildTableRows(backlogPlan, 'mtb-base', [week])
  const owed = table.find((row) => row.sku === 'RW-9901')!
  const surplus = table.find((row) => row.sku === 'RW-9324')!
  const lineRows = backlogPlan.rows.filter((row) => row.weekStart === week && row.line === 'mtb-base')

  it('explains why the largest-backlog SKU received capacity', () => {
    const view = render(
      <DerivationDrawer
        row={surplus}
        lineRows={lineRows}
        rule="backlog-first"
        onClose={() => undefined}
        onSelectSku={() => undefined}
      />,
    )

    expect(view.getByRole('heading', { name: /Why did RW-9901 get capacity/ })).toBeTruthy()
    expect(view.container.textContent).toMatch(/largest outstanding backlog/)
    expect(view.getByText('Before allocation')).toBeTruthy()
    expect(view.getByText('After allocation')).toBeTruthy()
    expect(view.getByText('Largest backlog')).toBeTruthy()
    expect(view.getByText(`${units(owed.startingBacklog)} owed`)).toBeTruthy()
    expect(view.container.textContent).toContain(`${units(owed.capacity)} units available`)
    expect(view.container.textContent).toContain(`${owed.sku} receives ${units(owed.build)}`)
    expect(view.container.textContent).toContain(`${units(owed.build)} allocated`)
    expect(view.container.textContent).not.toMatch(/furthest below/)
  })
})
