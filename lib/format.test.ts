import { describe, expect, it } from 'vitest'
import { targetPeriodLabel } from './format'

const ROAD = [
  { from: '2026-01-01' },
  { from: '2028-01-01' },
]
const MOUNTAIN = [{ from: '2026-01-01' }]

describe('target-cover period labels', () => {
  it('shows the first Road period as a compact 2026–27 span', () => {
    expect(targetPeriodLabel(ROAD, 0, '2028')).toBe('2026–27')
  })

  it('keeps the Road step-up as 2028', () => {
    expect(targetPeriodLabel(ROAD, 1, '2028')).toBe('2028')
  })

  it('labels a constant Mountain target as a single 2026-2028 span', () => {
    expect(targetPeriodLabel(MOUNTAIN, 0, '2028')).toBe('2026-2028')
  })
})
