import { describe, expect, it } from 'vitest'
import { compareHands, evaluateBest, evaluateFive } from '../src/game/evaluator'
import type { Card } from '../src/game/types'

const hand = (...cards: string[]) => cards as Card[]

describe('hand evaluator', () => {
  it('orders every standard category correctly', () => {
    const categories = [
      hand('AS', 'KH', '9D', '6C', '3S'),
      hand('JS', 'JH', 'AD', '7C', '3S'),
      hand('AS', 'AH', '6D', '6C', '9S'),
      hand('8S', '8H', '8D', 'KC', '4S'),
      hand('9S', '8H', '7D', '6C', '5S'),
      hand('KS', 'JS', '8S', '5S', '2S'),
      hand('10S', '10H', '10D', '7C', '7S'),
      hand('QS', 'QH', 'QD', 'QC', '7S'),
      hand('9S', '8S', '7S', '6S', '5S'),
    ].map(evaluateFive)

    for (let index = 1; index < categories.length; index += 1) {
      expect(compareHands(categories[index], categories[index - 1])).toBeGreaterThan(0)
    }
  })

  it('recognises ace-low straights and royal flushes', () => {
    expect(evaluateFive(hand('AS', '2H', '3D', '4C', '5S')).score).toEqual([4, 5])
    expect(evaluateFive(hand('AS', 'KS', 'QS', 'JS', '10S')).label).toBe('皇家同花顺')
  })

  it('chooses the best five cards from seven and resolves kickers', () => {
    const aces = evaluateBest(hand('AS', 'AH', 'KD', 'QC', '9S', '4H', '2C'))
    const kings = evaluateBest(hand('KS', 'KH', 'AD', 'QC', '9D', '4C', '2S'))
    expect(aces.label).toBe('一对')
    expect(compareHands(aces, kings)).toBeGreaterThan(0)
  })
})
