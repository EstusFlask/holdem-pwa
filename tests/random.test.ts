import { describe, expect, it } from 'vitest'
import { cryptoShuffle } from '../src/game/random'

describe('cryptographic shuffle primitive', () => {
  it('performs Fisher-Yates without mutating the source', () => {
    const source = [1, 2, 3, 4, 5]
    const values = [0, 1, 0, 1]
    let cursor = 0
    const shuffled = cryptoShuffle(source, (max) => values[cursor++] % max)
    expect(source).toEqual([1, 2, 3, 4, 5])
    expect(shuffled).toHaveLength(5)
    expect(new Set(shuffled).size).toBe(5)
    expect(shuffled).not.toEqual(source)
  })
})
