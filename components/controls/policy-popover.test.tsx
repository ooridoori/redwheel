// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_POLICY } from '../../lib/engine/policy'
import { AssumptionsPopover } from './policy-popover'

afterEach(cleanup)

describe('scenario trigger names the selected allocation policy', () => {
  it('shows the draft rationing label instead of Configure', () => {
    const view = render(
      <AssumptionsPopover draft={DEFAULT_POLICY} onChange={() => undefined} onReset={() => undefined} isDirty={false} />,
    )

    expect(view.getByRole('button', { name: /ScenarioWorst-off first/ })).toBeTruthy()
    expect(view.queryByText('Configure')).toBeNull()
  })

  it('updates the trigger when the draft policy changes, with the unapplied-changes indicator', () => {
    const draft = { ...DEFAULT_POLICY, rationing: 'proportional' as const }
    const view = render(
      <AssumptionsPopover draft={draft} onChange={() => undefined} onReset={() => undefined} isDirty />,
    )

    expect(view.getByRole('button', { name: /ScenarioProportional to need/ })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: /ScenarioProportional to need/ }))
    expect(view.getAllByText('Proportional to need').length).toBeGreaterThan(1)
  })
})
