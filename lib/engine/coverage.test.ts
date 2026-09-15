import { describe, expect, it } from 'vitest'
import { averageWeeklyDemand, coverageWeeks, targetInventory } from './coverage'

describe('weeks of supply', () => {
  it('counts how many weeks of demand the stock covers', () => {
    expect(coverageWeeks(100, [50, 50, 50])).toBe(2)
  })

  it('respects uneven demand rather than dividing by an average', () => {
    // The same 100 units cover two quiet weeks but only one busy one.
    expect(coverageWeeks(100, [50, 50])).toBe(2)
    expect(coverageWeeks(100, [100, 100])).toBe(1)
  })

  it('reports part weeks', () => {
    expect(coverageWeeks(75, [50, 50])).toBe(1.5)
  })

  it('holds nothing means covering nothing', () => {
    expect(coverageWeeks(0, [50, 50])).toBe(0)
  })

  it('expresses owing more than we hold as negative weeks', () => {
    // Owing 100 against 50-unit weeks is two weeks in the hole.
    expect(coverageWeeks(-100, [50, 50])).toBe(-2)
  })

  it("reproduces the brief's own example: 8 weeks of stock less 5 weeks owed is 3", () => {
    const weeklyDemand = 100
    const forward = Array.from({ length: 20 }, () => weeklyDemand)
    const inventory = 8 * weeklyDemand
    const backlog = 5 * weeklyDemand
    expect(coverageWeeks(inventory - backlog, forward)).toBe(3)
  })

  it('extrapolates at the average rate when cover runs past the forecast', () => {
    expect(coverageWeeks(300, [100, 100])).toBe(3)
  })

  it('survives a forecast of zero without dividing by it', () => {
    expect(coverageWeeks(100, [0, 0])).toBe(2)
    expect(coverageWeeks(-100, [0, 0])).toBe(0)
    expect(coverageWeeks(100, [])).toBe(0)
  })
})

describe('target inventory', () => {
  it('sums exactly the number of forward weeks the target asks for', () => {
    expect(targetInventory([10, 20, 30, 40], 3)).toBe(60)
  })

  it('takes what it can when the forecast is shorter than the target', () => {
    expect(targetInventory([10, 20], 8)).toBe(30)
  })

  it('asks for nothing when the target is zero weeks', () => {
    expect(targetInventory([10, 20], 0)).toBe(0)
  })
})

describe('average weekly demand', () => {
  it('averages over the window given', () => {
    expect(averageWeeklyDemand([10, 20, 30])).toBe(20)
  })

  it('is zero for an empty window', () => {
    expect(averageWeeklyDemand([])).toBe(0)
  })
})
