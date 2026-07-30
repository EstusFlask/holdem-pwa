import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createDeck,
  createGame,
  legalActions,
  publicStateFor,
  startHand,
} from '../src/game/engine'
import type { PlayerProfile, RandomInt } from '../src/game/types'

const players: PlayerProfile[] = [
  { id: 'p1-player', name: 'A', avatar: '' },
  { id: 'p2-player', name: 'B', avatar: '' },
  { id: 'p3-player', name: 'C', avatar: '' },
]

const deterministic: RandomInt = (max) => max - 1

describe('Texas Hold’em engine', () => {
  it('creates a unique 52-card deck', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck).size).toBe(52)
  })

  it('uses correct heads-up blind and action order', () => {
    const state = createGame('HEADS', players.slice(0, 2), { smallBlind: 5, bigBlind: 10 })
    startHand(state, deterministic)
    expect(state.dealerIndex).toBe(state.smallBlindIndex)
    expect(state.actorIndex).toBe(state.smallBlindIndex)
    expect(state.players[state.smallBlindIndex].bet).toBe(5)
    expect(state.players[state.bigBlindIndex].bet).toBe(10)
  })

  it('hides opponents hole cards outside showdown', () => {
    const state = createGame('SECRET', players)
    startHand(state, deterministic)
    const publicState = publicStateFor(state, 'p1-player')
    expect(publicState.players.find((player) => player.id === 'p1-player')?.hole).toHaveLength(2)
    expect(publicState.players.find((player) => player.id === 'p2-player')?.hole).toHaveLength(0)
    expect(publicState.deck).toHaveLength(0)
    expect(publicState.burned).toHaveLength(0)
  })

  it('awards the pot immediately when everyone else folds', () => {
    const state = createGame('FOLDS', players, { startingStack: 1000, smallBlind: 5, bigBlind: 10 })
    startHand(state, deterministic)
    const first = state.players[state.actorIndex]
    applyAction(state, first.id, 'fold')
    const second = state.players[state.actorIndex]
    applyAction(state, second.id, 'fold')
    expect(state.phase).toBe('complete')
    expect(state.winners).toHaveLength(1)
    expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(3000)
  })

  it('builds and settles side pots while conserving every chip', () => {
    const state = createGame('SIDEPOT', players, { startingStack: 300, smallBlind: 5, bigBlind: 10 })
    state.players[0].stack = 100
    state.players[1].stack = 300
    state.players[2].stack = 300
    startHand(state, deterministic)

    const first = state.players[state.actorIndex]
    expect(first.id).toBe('p1-player')
    applyAction(state, first.id, 'all-in')
    applyAction(state, state.players[state.actorIndex].id, 'call')
    applyAction(state, state.players[state.actorIndex].id, 'all-in')
    applyAction(state, state.players[state.actorIndex].id, 'call')

    expect(state.phase).toBe('complete')
    expect(state.community).toHaveLength(5)
    expect(state.players.reduce((sum, player) => sum + player.stack, 0)).toBe(700)
    expect(state.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(700)
  })

  it('enforces the minimum full raise', () => {
    const state = createGame('RAISE', players, { startingStack: 1000, smallBlind: 5, bigBlind: 10 })
    startHand(state, deterministic)
    const actor = state.players[state.actorIndex]
    const legal = legalActions(state, actor.id)
    expect(legal.minRaiseTo).toBe(20)
    expect(() => applyAction(state, actor.id, 'raise', 15)).toThrow('最小加注至 20')
  })

  it('does not reopen raising after a short all-in', () => {
    const state = createGame('SHORT', players, { startingStack: 1000, smallBlind: 5, bigBlind: 10 })
    state.players[1].stack = 25
    startHand(state, deterministic)

    applyAction(state, 'p1-player', 'raise', 20)
    applyAction(state, 'p2-player', 'all-in')
    applyAction(state, 'p3-player', 'call')

    const legal = legalActions(state, 'p1-player')
    expect(legal.canCall).toBe(true)
    expect(legal.toCall).toBe(5)
    expect(legal.canRaise).toBe(false)
  })

  it('rejects non-finite raises and invalid game settings', () => {
    expect(() => createGame('BAD', players, { actionSeconds: Number.NaN })).toThrow('整数')

    const state = createGame('SAFE', players)
    startHand(state, deterministic)
    const actor = state.players[state.actorIndex]
    expect(() => applyAction(state, actor.id, 'raise', Number.NaN)).toThrow('加注金额无效')
  })
})
