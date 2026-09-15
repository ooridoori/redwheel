/**
 * The roll-forward identities, checked against Redwheel's actual data.
 *
 * The fixtures in `engine.test.ts` use flat demand and flat capacity, which is
 * what makes them readable — but also what could let a bug hide. These run the
 * real 121-week plan, under every policy, and assert the same arithmetic holds
 * for all 1,210 rows.
 */
import { describe, expect, it } from 'vitest'
import { LINES } from '../domain'
import { loadPlanningInputs } from '../load-inputs'
import { runAllocation } from './index'
import { DEFAULT_POLICY, type RationingRule } from './policy'
import type { DealerStockTreatment } from './dealer-buffer'

const inputs = loadPlanningInputs()
const RULES: RationingRule[] = ['worst-first', 'proportional', 'backlog-first']
const TREATMENTS: DealerStockTreatment[] = ['channel-segregated', 'exclude', 'central']

describe('roll-forward against the real plan', () => {
  it('covers every SKU in every planned week', () => {
    const plan = runAllocation(inputs)
    expect(plan.rows).toHaveLength(inputs.products.length * inputs.planWeeks.length)
  })

  for (const rationing of RULES) {
    describe(`under ${rationing}`, () => {
      const plan = runAllocation(inputs, { ...DEFAULT_POLICY, rationing })

      it('balances stock and demand in every week', () => {
        for (const row of plan.rows) {
          expect(row.endingInventory).toBe(row.startingInventory + row.build - row.shipped)
          expect(row.endingBacklog).toBe(row.startingBacklog + row.forecast - row.shipped)
          expect(Math.min(row.endingInventory, row.endingBacklog)).toBe(0)
          expect(row.endingInventory).toBeGreaterThanOrEqual(0)
          expect(row.endingBacklog).toBeGreaterThanOrEqual(0)
        }
      })

      it('carries each SKU forward without resetting it', () => {
        for (const product of inputs.products) {
          const rows = plan.rows.filter((row) => row.sku === product.sku)
          expect(rows).toHaveLength(inputs.planWeeks.length)

          expect(rows[0].startingInventory).toBe(inputs.openingStock[product.sku] ?? 0)
          expect(rows[0].startingBacklog).toBe(inputs.backlog[product.sku] ?? 0)

          for (const [index, row] of rows.slice(1).entries()) {
            expect(row.startingInventory).toBe(rows[index].endingInventory)
            expect(row.startingBacklog).toBe(rows[index].endingBacklog)
          }
        }
      })

      it('delivers or still owes every unit of demand, losing none', () => {
        for (const product of inputs.products) {
          const rows = plan.rows.filter((row) => row.sku === product.sku)
          const demanded = rows.reduce((total, row) => total + row.forecast, 0)
          const shipped = rows.reduce((total, row) => total + row.shipped, 0)
          const built = rows.reduce((total, row) => total + row.build, 0)
          const last = rows[rows.length - 1]

          expect(rows[0].startingBacklog + demanded).toBe(shipped + last.endingBacklog)
          expect(rows[0].startingInventory + built).toBe(shipped + last.endingInventory)
        }
      })

      it('respects each line\u2019s weekly ceiling', () => {
        for (const entry of plan.lineWeeks) {
          expect(entry.build).toBeLessThanOrEqual(entry.capacity)
          expect(entry.build).toBeLessThanOrEqual(entry.desiredBuild)
        }
      })

      it('rolls SKU rows up to the line totals the KPIs are built from', () => {
        for (const entry of plan.lineWeeks) {
          const rows = plan.rows.filter(
            (row) => row.weekStart === entry.weekStart && row.line === entry.line,
          )
          expect(rows.reduce((total, row) => total + row.build, 0)).toBe(entry.build)
          expect(rows.reduce((total, row) => total + row.endingInventory, 0)).toBe(entry.endingInventory)
          expect(rows.reduce((total, row) => total + row.endingBacklog, 0)).toBe(entry.endingBacklog)
        }
      })
    })
  }

  for (const dealerStock of TREATMENTS) {
    it(`holds when dealer stock is treated as "${dealerStock}"`, () => {
      const plan = runAllocation(inputs, { ...DEFAULT_POLICY, dealerStock })
      for (const row of plan.rows) {
        expect(row.endingInventory).toBe(row.startingInventory + row.build - row.shipped)
        expect(row.endingBacklog).toBe(row.startingBacklog + row.forecast - row.shipped)
      }
    })
  }

  it('builds only whole bikes', () => {
    const plan = runAllocation(inputs)
    for (const row of plan.rows) {
      expect(Number.isInteger(row.build)).toBe(true)
      expect(Number.isInteger(row.shipped)).toBe(true)
      expect(Number.isInteger(row.endingInventory)).toBe(true)
    }
  })

  it('leaves no line without capacity or products', () => {
    const plan = runAllocation(inputs)
    for (const line of LINES) {
      expect(plan.lineWeeks.some((entry) => entry.line === line)).toBe(true)
    }
  })
})
