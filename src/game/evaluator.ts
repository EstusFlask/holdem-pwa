import type { Card, Rank } from './types'

const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

const CATEGORY_LABELS = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
] as const

export interface HandRank {
  score: number[]
  category: number
  label: string
  cards: Card[]
}

function rankOf(card: Card): number {
  return RANK_VALUE[card.slice(0, -1) as Rank]
}

function suitOf(card: Card): string {
  return card.slice(-1)
}

function compareScore(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function compareHands(a: HandRank, b: HandRank): number {
  return compareScore(a.score, b.score)
}

export function evaluateFive(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('evaluateFive requires exactly five cards')

  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const counts = new Map<number, number>()
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1)

  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const flush = cards.every((card) => suitOf(card) === suitOf(cards[0]))
  const unique = [...new Set(ranks)]
  let straightHigh = 0
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0]
    else if (unique.join(',') === '14,5,4,3,2') straightHigh = 5
  }

  let category: number
  let kickers: number[]

  if (flush && straightHigh) {
    category = 8
    kickers = [straightHigh]
  } else if (groups[0][1] === 4) {
    category = 7
    kickers = [groups[0][0], groups[1][0]]
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6
    kickers = [groups[0][0], groups[1][0]]
  } else if (flush) {
    category = 5
    kickers = ranks
  } else if (straightHigh) {
    category = 4
    kickers = [straightHigh]
  } else if (groups[0][1] === 3) {
    category = 3
    kickers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)]
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2
    const pairRanks = [groups[0][0], groups[1][0]].sort((a, b) => b - a)
    kickers = [...pairRanks, groups[2][0]]
  } else if (groups[0][1] === 2) {
    category = 1
    kickers = [groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)]
  } else {
    category = 0
    kickers = ranks
  }

  return {
    category,
    score: [category, ...kickers],
    label: category === 8 && straightHigh === 14 ? '皇家同花顺' : CATEGORY_LABELS[category],
    cards,
  }
}

export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluateBest requires five to seven cards')
  let best: HandRank | null = null

  for (let a = 0; a < cards.length - 4; a += 1) {
    for (let b = a + 1; b < cards.length - 3; b += 1) {
      for (let c = b + 1; c < cards.length - 2; c += 1) {
        for (let d = c + 1; d < cards.length - 1; d += 1) {
          for (let e = d + 1; e < cards.length; e += 1) {
            const candidate = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]])
            if (!best || compareHands(candidate, best) > 0) best = candidate
          }
        }
      }
    }
  }

  if (!best) throw new Error('No five-card combination found')
  return best
}
