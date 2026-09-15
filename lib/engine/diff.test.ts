import { describe, expect, it } from 'vitest'
import { loadPlanningInputs } from '../load-inputs'
import { runAllocation } from './index'
import { DEFAULT_POLICY } from './policy'
import { diffPlans } from './diff'

const inputs = loadPlanningInputs()

describe('diffPlans', () => {
  it('reports nothing before a second run exists', () => {
    const plan = runAllocation(inputs)
    const diff = diffPlans(plan, null)

    expect(diff.hasPrevious).toBe(false)
    expect(diff.build.size).toBe(0)
    expect(diff.cover.size).toBe(0)
  })

  it('reports nothing when the policy did not change', () => {
    const diff = diffPlans(runAllocation(inputs), runAllocation(inputs))

    expect(diff.hasPrevious).toBe(true)
    expect(diff.build.size).toBe(0)
    expect(diff.cover.size).toBe(0)
  })

  it('finds the rows a lower target changes', () => {
    const before = runAllocation(inputs)
    const after = runAllocation(inputs, {
      ...DEFAULT_POLICY,
      targets: {
        ...DEFAULT_POLICY.targets,
        'mtb-carbon': DEFAULT_POLICY.targets['mtb-carbon'].map((rule) => ({ ...rule, weeks: 4 })),
      },
    })
    const diff = diffPlans(after, before)

    expect(diff.build.size).toBeGreaterThan(0)
    expect(diff.cover.size).toBeGreaterThan(0)
    // A target only governs its own line, so nothing off mtb-carbon may move.
    for (const key of [...diff.build, ...diff.cover]) {
      const row = after.rows.find((candidate) => `${candidate.weekStart}|${candidate.sku}` === key)!
      expect(row.line).toBe('mtb-carbon')
    }
  })

  it('only flags rows whose rendered value differs', () => {
    const before = runAllocation(inputs)
    const after = runAllocation(inputs, { ...DEFAULT_POLICY, rationing: 'proportional' })
    const diff = diffPlans(after, before)

    const previousOf = new Map(before.rows.map((row) => [`${row.weekStart}|${row.sku}`, row]))
    for (const row of after.rows) {
      const key = `${row.weekStart}|${row.sku}`
      const was = previousOf.get(key)!
      expect(diff.build.has(key)).toBe(row.build !== was.build)
    }
  })

  it('flags every row that moved, in both directions', () => {
    const low = runAllocation(inputs, {
      ...DEFAULT_POLICY,
      targets: {
        ...DEFAULT_POLICY.targets,
        'road-base': DEFAULT_POLICY.targets['road-base'].map((rule) => ({ ...rule, weeks: 2 })),
      },
    })
    const high = runAllocation(inputs)

    expect(diffPlans(high, low).build).toEqual(diffPlans(low, high).build)
  })
})
