import { describe, expect, it } from 'vitest'
import {
  CHIP_DENOMINATIONS,
  chipAssetFiles,
  chipBreakdown,
  largestChip,
} from '../src/services/chips'

/** Total the piles back up: a breakdown that loses chips is worse than none. */
function total(amount: number): number {
  return chipBreakdown(amount).reduce((sum, pile) => sum + pile.value * pile.count, 0)
}

describe('chip breakdown', () => {
  it('renders a round pot as chips of that denomination', () => {
    expect(chipBreakdown(3000)).toEqual([{ value: 1000, count: 3 }])
    expect(chipBreakdown(500)).toEqual([{ value: 500, count: 1 }])
  })

  it('is exact for every amount up to a deep stack', () => {
    for (let amount = 0; amount <= 3000; amount += 1) expect(total(amount)).toBe(amount)
    for (const amount of [4_999, 12_345, 40_000, 99_999]) expect(total(amount)).toBe(amount)
  })

  it('cuts from the largest denomination down', () => {
    expect(chipBreakdown(6630)).toEqual([
      { value: 5000, count: 1 },
      { value: 1000, count: 1 },
      { value: 500, count: 1 },
      { value: 100, count: 1 },
      { value: 25, count: 1 },
      { value: 5, count: 1 },
    ])
  })

  it('renders nothing for an empty or negative pot', () => {
    expect(chipBreakdown(0)).toEqual([])
    expect(chipBreakdown(-40)).toEqual([])
  })

  it('ignores fractions rather than inventing a chip for them', () => {
    expect(chipBreakdown(25.9)).toEqual([{ value: 25, count: 1 }])
  })

  it('picks a single disc that the amount can actually cover', () => {
    expect(largestChip(20)).toBe(5)
    expect(largestChip(1200)).toBe(1000)
    expect(largestChip(0)).toBe(1)
  })

  it('requires the sheet plus one file per denomination', () => {
    const files = chipAssetFiles()
    expect(files).toHaveLength(CHIP_DENOMINATIONS.length + 1)
    expect(files).toContain('chips.svg')
    expect(files).toContain('chip-1000.svg')
  })
})
