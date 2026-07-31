import { describe, expect, it } from 'vitest'
import { diffGameState } from '../src/game/events'
import { applyAction, createGame, legalActions, startHand } from '../src/game/engine'
import type { GameState, PlayerProfile, RandomInt } from '../src/game/types'

const players: PlayerProfile[] = [
  { id: 'p1-player', name: 'A', avatar: '' },
  { id: 'p2-player', name: 'B', avatar: '' },
  { id: 'p3-player', name: 'C', avatar: '' },
]

const deterministic: RandomInt = (max) => max - 1

function newHand(roomCode: string): GameState {
  const state = createGame(roomCode, players, { startingStack: 1000, smallBlind: 5, bigBlind: 10 })
  startHand(state, deterministic)
  return state
}

/** Closes the street the cheapest legal way, so tests never guess wrong. */
function passiveStep(state: GameState): void {
  const actor = state.players[state.actorIndex]
  const legal = legalActions(state, actor.id)
  applyAction(state, actor.id, legal.canCheck ? 'check' : 'call')
}

describe('event producer', () => {
  it('emits a deal event when the hand number changes', () => {
    const before = createGame('DEAL', players, { startingStack: 1000 })
    const after = structuredClone(before)
    startHand(after, deterministic)
    const events = diffGameState(before, after)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'deal', handNumber: 1 })
  })

  it('has no prior snapshot to compare against on first sight', () => {
    expect(diffGameState(null, newHand('FIRST'))).toHaveLength(0)
  })

  it('classifies a fold action', () => {
    const state = newHand('FOLD')
    const snapshot = structuredClone(state)
    applyAction(state, state.players[state.actorIndex].id, 'fold')
    const events = diffGameState(snapshot, state)
    expect(events.some((event) => event.kind === 'action' && event.action === 'fold')).toBe(true)
  })

  it('classifies a raise and reads the amount off the stack delta', () => {
    const state = newHand('RAISE')
    const snapshot = structuredClone(state)
    const actor = state.players[state.actorIndex]
    const legal = legalActions(state, actor.id)
    applyAction(state, actor.id, 'raise', legal.minRaiseTo)
    const events = diffGameState(snapshot, state)
    const raise = events.find((event) => event.kind === 'action')
    expect(raise).toMatchObject({ kind: 'action', action: 'raise', playerId: actor.id })
    expect(raise && raise.kind === 'action' && raise.amount).toBeGreaterThan(0)
  })

  it('emits collect then board events when a street closes', () => {
    const state = newHand('FLOP')
    const snapshot = structuredClone(state)
    while (state.phase === 'preflop') passiveStep(state)

    const events = diffGameState(snapshot, state)
    const collectAt = events.findIndex((event) => event.kind === 'collect')
    const boardAt = events.findIndex((event) => event.kind === 'board')
    expect(collectAt).toBeGreaterThanOrEqual(0)
    expect(boardAt).toBeGreaterThan(collectAt)
    expect(events[boardAt]).toMatchObject({ kind: 'board', street: 'flop', shown: 3 })
  })

  it('reconstructs settlement beats when everyone folds to one player', () => {
    const state = newHand('SETTLE')
    const snapshot = structuredClone(state)
    while (state.phase !== 'complete') {
      const actor = state.players[state.actorIndex]
      if (actor.id === 'p1-player') passiveStep(state)
      else applyAction(state, actor.id, 'fold')
    }

    const events = diffGameState(snapshot, state)
    const settle = events.find((event) => event.kind === 'settle')
    expect(settle).toBeDefined()
    expect(events.some((event) => event.kind === 'award')).toBe(true)
    // The pot the banner shows must match what the engine actually paid out.
    const paid = state.winners.reduce((sum, winner) => sum + winner.amount, 0)
    expect(settle && settle.kind === 'settle' && settle.pot).toBe(paid)
  })

  it('does not animate across unrelated rooms', () => {
    expect(diffGameState(newHand('A'), newHand('B'))).toHaveLength(0)
  })

  it('does not animate a board that went backwards', () => {
    const state = newHand('REWIND')
    while (state.phase === 'preflop') passiveStep(state)
    const rewound = { ...state, community: [] }
    expect(diffGameState(state, rewound)).toHaveLength(0)
  })
})
