import type { Card, GameState, Winner } from './types'

/** How a committed amount reads on the felt and in the callout. */
export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in' | 'blind'

export interface ActionEvent {
  kind: 'action'
  id: number
  playerId: string
  action: ActionKind
  /** Chips this action moved from stack to bet. Zero for fold and check. */
  amount: number
  /** The player's street bet once the action landed. */
  betTo: number
}

export interface CollectEvent {
  kind: 'collect'
  id: number
  contributions: Array<{ playerId: string; amount: number }>
  /** Pot total once every contribution has landed. */
  potTo: number
}

export interface BoardEvent {
  kind: 'board'
  id: number
  street: 'flop' | 'turn' | 'river'
  /** Community cards visible once this street finishes dealing. */
  shown: number
  cards: Card[]
}

export interface RevealEvent {
  kind: 'reveal'
  id: number
  playerIds: string[]
}

export interface SettleEvent {
  kind: 'settle'
  id: number
  winners: Winner[]
  pot: number
}

export interface AwardEvent {
  kind: 'award'
  id: number
  payouts: Array<{ playerId: string; amount: number }>
}

export interface DealEvent {
  kind: 'deal'
  id: number
  playerIds: string[]
  handNumber: number
}

export type TableEvent =
  | ActionEvent
  | CollectEvent
  | BoardEvent
  | RevealEvent
  | SettleEvent
  | AwardEvent
  | DealEvent

/** Streets in the order the board fills, so a run-out can be replayed one card at a time. */
const STREETS: Array<{ street: 'flop' | 'turn' | 'river'; shown: number }> = [
  { street: 'flop', shown: 3 },
  { street: 'turn', shown: 4 },
  { street: 'river', shown: 5 },
]

/**
 * Classifies one player's move from the shape of the state change alone, so the
 * animation layer never has to parse `lastAction` display copy.
 *
 * `streetClosed` matters because `resetStreet` wipes `bet` and `currentBet`: once
 * that has happened the call-versus-raise distinction is no longer recoverable,
 * and a street-closing move can only have been a check, a call, or a fold anyway.
 */
function classifyAction(
  before: { totalBet: number; folded: boolean; allIn: boolean; bet: number },
  after: { totalBet: number; folded: boolean; allIn: boolean; bet: number },
  prevCurrentBet: number,
  nextCurrentBet: number,
  streetClosed: boolean,
): { action: ActionKind; amount: number } | null {
  if (!before.folded && after.folded) return { action: 'fold', amount: 0 }
  const amount = after.totalBet - before.totalBet
  if (amount <= 0) return { action: 'check', amount: 0 }
  if (!before.allIn && after.allIn) return { action: 'all-in', amount }
  if (streetClosed) return { action: 'call', amount }
  const raised = nextCurrentBet > prevCurrentBet && after.bet >= nextCurrentBet
  if (!raised) return { action: 'call', amount }
  return { action: prevCurrentBet > 0 ? 'raise' : 'bet', amount }
}

/** Board events for every street that became visible between two snapshots. */
function boardEvents(prevShown: number, nextShown: number, community: Card[], next: () => number): BoardEvent[] {
  return STREETS
    .filter(({ shown }) => shown > prevShown && shown <= nextShown)
    .map(({ street, shown }) => ({
      kind: 'board' as const,
      id: next(),
      street,
      shown,
      cards: community.slice(0, shown),
    }))
}

/**
 * Turns two consecutive `GameState` snapshots into the list of things that
 * visibly happened between them.
 *
 * The engine settles a hand synchronously — the closing call, the remaining
 * board cards, the showdown and the payout all land in a single snapshot with
 * `pot` and every `bet` already zeroed. So the settlement path reconstructs the
 * closing action from `winners` (whose amounts still sum to the real pot) rather
 * than from bet deltas that no longer exist.
 *
 * Returns an empty list when the snapshots are not comparable (a fresh hand, a
 * rejoining peer, a shrinking board): the caller snaps to the new state instead
 * of animating a transition that never happened.
 */
export function diffGameState(prev: GameState | null, next: GameState): TableEvent[] {
  let sequence = 0
  const id = (): number => (sequence += 1)

  if (!prev || prev.roomCode !== next.roomCode) return []
  if (next.handNumber !== prev.handNumber) {
    if (next.phase !== 'preflop') return []
    return [{
      kind: 'deal',
      id: id(),
      playerIds: next.players.filter((player) => player.hole.length > 0).map((player) => player.id),
      handNumber: next.handNumber,
    }]
  }
  if (next.community.length < prev.community.length) return []

  const before = new Map(prev.players.map((player) => [player.id, player]))
  const events: TableEvent[] = []
  const settling = next.phase === 'complete' && prev.phase !== 'complete'
  const streetClosed = settling || next.community.length > prev.community.length

  if (settling) {
    const finalPot = next.winners.reduce((sum, winner) => sum + winner.amount, 0)
    const actor = prev.players[prev.actorIndex]
    const closing = actor ? next.players.find((player) => player.id === actor.id) : undefined
    const committed = Math.max(0, finalPot - prev.pot)

    if (actor && closing) {
      const action: ActionKind = closing.folded
        ? 'fold'
        : committed <= 0
          ? 'check'
          : closing.allIn && !actor.allIn
            ? 'all-in'
            : 'call'
      events.push({ kind: 'action', id: id(), playerId: actor.id, action, amount: committed, betTo: actor.bet + committed })
    }

    const contributions = prev.players
      .map((player) => ({
        playerId: player.id,
        amount: player.bet + (player.id === actor?.id ? committed : 0),
      }))
      .filter((entry) => entry.amount > 0)
    if (contributions.length) events.push({ kind: 'collect', id: id(), contributions, potTo: finalPot })

    events.push(...boardEvents(prev.community.length, next.community.length, next.community, id))

    const revealed = next.players.filter((player) => !player.folded && player.hole.length > 0)
    if (revealed.length > 1) {
      events.push({ kind: 'reveal', id: id(), playerIds: revealed.map((player) => player.id) })
    }
    events.push({ kind: 'settle', id: id(), winners: next.winners, pot: finalPot })
    if (next.winners.length) {
      events.push({
        kind: 'award',
        id: id(),
        payouts: next.winners.map((winner) => ({ playerId: winner.playerId, amount: winner.amount })),
      })
    }
    return events
  }

  for (const player of next.players) {
    const previous = before.get(player.id)
    if (!previous) continue
    if (previous.totalBet === player.totalBet && previous.folded === player.folded) continue
    const move = classifyAction(previous, player, prev.currentBet, next.currentBet, streetClosed)
    if (!move) continue
    events.push({
      kind: 'action',
      id: id(),
      playerId: player.id,
      action: move.action,
      amount: move.amount,
      betTo: streetClosed ? previous.bet + move.amount : player.bet,
    })
  }

  if (streetClosed) {
    const contributions = prev.players
      .map((player) => {
        const after = next.players.find((candidate) => candidate.id === player.id)
        const extra = after ? Math.max(0, after.totalBet - player.totalBet) : 0
        return { playerId: player.id, amount: player.bet + extra }
      })
      .filter((entry) => entry.amount > 0)
    if (contributions.length) events.push({ kind: 'collect', id: id(), contributions, potTo: next.pot })
    events.push(...boardEvents(prev.community.length, next.community.length, next.community, id))
  }

  return events
}
