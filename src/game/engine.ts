import { evaluateBest, compareHands } from './evaluator'
import { cryptoShuffle } from './random'
import { RANKS, SUITS } from './types'
import type {
  Card,
  GameConfig,
  GameState,
  LegalActions,
  PlayerAction,
  PlayerProfile,
  PlayerState,
  RandomInt,
} from './types'

const DEFAULT_CONFIG: GameConfig = {
  roomName: '周五牌局',
  startingStack: 2000,
  smallBlind: 10,
  bigBlind: 20,
  maxPlayers: 10,
  actionSeconds: 30,
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}` as Card))
}

export function createGame(
  roomCode: string,
  profiles: PlayerProfile[],
  config: Partial<GameConfig> = {},
): GameState {
  const resolved = { ...DEFAULT_CONFIG, ...config }
  const numericConfig = [
    resolved.startingStack,
    resolved.smallBlind,
    resolved.bigBlind,
    resolved.maxPlayers,
    resolved.actionSeconds,
  ]
  if (numericConfig.some((value) => !Number.isSafeInteger(value))) {
    throw new Error('牌局设置必须使用整数')
  }
  if (
    resolved.startingStack <= 0
    || resolved.smallBlind <= 0
    || resolved.bigBlind < resolved.smallBlind
    || resolved.bigBlind > resolved.startingStack
  ) {
    throw new Error('盲注设置无效')
  }
  if (resolved.maxPlayers < 2 || resolved.maxPlayers > 10) throw new Error('玩家上限必须为 2–10')
  if (resolved.actionSeconds < 5 || resolved.actionSeconds > 300) throw new Error('行动时间必须为 5–300 秒')
  if (profiles.length > resolved.maxPlayers) throw new Error('玩家人数超过上限')

  return {
    roomCode,
    config: resolved,
    phase: 'lobby',
    handNumber: 0,
    players: profiles.map((profile, seat) => ({
      ...profile,
      seat,
      stack: resolved.startingStack,
      hole: [],
      folded: false,
      allIn: false,
      bet: 0,
      totalBet: 0,
      acted: false,
      connected: true,
    })),
    dealerIndex: -1,
    smallBlindIndex: -1,
    bigBlindIndex: -1,
    actorIndex: -1,
    community: [],
    deck: [],
    burned: [],
    currentBet: 0,
    minRaise: resolved.bigBlind,
    pot: 0,
    winners: [],
    log: [],
    actionDeadline: null,
  }
}

function eligibleForHand(player: PlayerState): boolean {
  return player.connected && player.stack > 0
}

function canAct(player: PlayerState): boolean {
  return !player.folded && !player.allIn && player.stack > 0
}

function nextIndex(
  state: GameState,
  from: number,
  predicate: (player: PlayerState) => boolean = (player) => !player.folded,
): number {
  if (!state.players.length) return -1
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (from + offset + state.players.length) % state.players.length
    if (predicate(state.players[index])) return index
  }
  return -1
}

function take(state: GameState, count: number): Card[] {
  const cards = state.deck.splice(0, count)
  if (cards.length !== count) throw new Error('牌堆不足')
  return cards
}

function commit(player: PlayerState, amount: number): number {
  const paid = Math.min(player.stack, Math.max(0, amount))
  player.stack -= paid
  player.bet += paid
  player.totalBet += paid
  player.allIn = player.stack === 0
  return paid
}

function setActor(state: GameState, index: number): void {
  state.actorIndex = index
  state.actionDeadline = index >= 0 ? Date.now() + state.config.actionSeconds * 1000 : null
}

function recomputePot(state: GameState): void {
  state.pot = state.players.reduce((sum, player) => sum + player.totalBet, 0)
}

export function startHand(state: GameState, randomInt: RandomInt): GameState {
  const active = state.players.filter(eligibleForHand)
  if (active.length < 2) throw new Error('至少需要两名有筹码且在线的玩家')

  state.handNumber += 1
  state.phase = 'preflop'
  state.community = []
  state.burned = []
  state.deck = cryptoShuffle(createDeck(), randomInt)
  state.currentBet = 0
  state.minRaise = state.config.bigBlind
  state.pot = 0
  state.winners = []
  state.log = [`第 ${state.handNumber} 手牌开始`]

  for (const player of state.players) {
    player.hole = []
    player.folded = !eligibleForHand(player)
    player.allIn = false
    player.bet = 0
    player.totalBet = 0
    player.acted = false
    player.lastAction = undefined
  }

  state.dealerIndex = nextIndex(state, state.dealerIndex, eligibleForHand)
  const headsUp = active.length === 2
  state.smallBlindIndex = headsUp
    ? state.dealerIndex
    : nextIndex(state, state.dealerIndex, eligibleForHand)
  state.bigBlindIndex = nextIndex(state, state.smallBlindIndex, eligibleForHand)

  const smallBlind = state.players[state.smallBlindIndex]
  const bigBlind = state.players[state.bigBlindIndex]
  commit(smallBlind, state.config.smallBlind)
  commit(bigBlind, state.config.bigBlind)
  smallBlind.lastAction = `小盲 ${smallBlind.bet}`
  bigBlind.lastAction = `大盲 ${bigBlind.bet}`
  state.currentBet = Math.max(smallBlind.bet, bigBlind.bet)

  let dealIndex = state.dealerIndex
  for (let round = 0; round < 2; round += 1) {
    for (let dealt = 0; dealt < active.length; dealt += 1) {
      dealIndex = nextIndex(state, dealIndex, eligibleForHand)
      state.players[dealIndex].hole.push(take(state, 1)[0])
    }
  }

  const first = headsUp
    ? state.smallBlindIndex
    : nextIndex(state, state.bigBlindIndex, canAct)
  setActor(state, canAct(state.players[first]) ? first : nextIndex(state, first, canAct))
  recomputePot(state)
  if (state.actorIndex < 0) runOutBoardAndSettle(state)
  return state
}

export function legalActions(state: GameState, playerId: string): LegalActions {
  const index = state.players.findIndex((player) => player.id === playerId)
  const player = state.players[index]
  if (!player || index !== state.actorIndex || !canAct(player)) {
    return {
      canFold: false,
      canCheck: false,
      canCall: false,
      canRaise: false,
      toCall: 0,
      minRaiseTo: 0,
      maxRaiseTo: 0,
    }
  }

  const toCall = Math.max(0, state.currentBet - player.bet)
  const maxRaiseTo = player.bet + player.stack
  const normalMinimum = state.currentBet === 0
    ? state.config.bigBlind
    : state.currentBet + state.minRaise
  const minRaiseTo = Math.min(maxRaiseTo, normalMinimum)

  return {
    canFold: toCall > 0,
    canCheck: toCall === 0,
    canCall: toCall > 0,
    canRaise:
      maxRaiseTo > state.currentBet
      && (!player.acted || state.currentBet - player.bet >= state.minRaise),
    toCall: Math.min(toCall, player.stack),
    minRaiseTo,
    maxRaiseTo,
  }
}

function bettingRoundComplete(state: GameState): boolean {
  const contenders = state.players.filter((player) => !player.folded)
  if (contenders.length <= 1) return true
  return contenders
    .filter((player) => !player.allIn)
    .every((player) => player.acted && player.bet === state.currentBet)
}

function remainingContenders(state: GameState): PlayerState[] {
  return state.players.filter((player) => !player.folded)
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: PlayerAction,
  raiseTo?: number,
): GameState {
  const index = state.players.findIndex((player) => player.id === playerId)
  if (index !== state.actorIndex) throw new Error('还没轮到这名玩家')
  const player = state.players[index]
  if (!canAct(player)) throw new Error('这名玩家当前不能行动')
  const legal = legalActions(state, playerId)

  if (action === 'fold') {
    player.folded = true
    player.acted = true
    player.lastAction = '弃牌'
  } else if (action === 'check') {
    if (!legal.canCheck) throw new Error('当前不能过牌')
    player.acted = true
    player.lastAction = '过牌'
  } else if (action === 'call') {
    if (!legal.canCall) throw new Error('当前无需跟注')
    const paid = commit(player, legal.toCall)
    player.acted = true
    player.lastAction = player.allIn ? `全下 ${paid}` : `跟注 ${paid}`
  } else {
    const target = action === 'all-in' ? legal.maxRaiseTo : Math.floor(raiseTo ?? 0)
    if (!Number.isSafeInteger(target) || !legal.canRaise || target <= state.currentBet || target > legal.maxRaiseTo) {
      throw new Error('加注金额无效')
    }
    const fullRaiseMinimum = state.currentBet === 0
      ? state.config.bigBlind
      : state.currentBet + state.minRaise
    const isShortAllIn = target < fullRaiseMinimum && target === legal.maxRaiseTo
    if (target < fullRaiseMinimum && !isShortAllIn) throw new Error(`最小加注至 ${legal.minRaiseTo}`)

    const previousBet = state.currentBet
    commit(player, target - player.bet)
    state.currentBet = player.bet
    if (!isShortAllIn) {
      state.minRaise = state.currentBet - previousBet
      for (const other of state.players) {
        if (other.id !== player.id && canAct(other)) other.acted = false
      }
    }
    player.acted = true
    player.lastAction = player.allIn ? `全下 ${player.bet}` : `${previousBet ? '加注至' : '下注'} ${player.bet}`
  }

  state.log.push(`${player.name} ${player.lastAction}`)
  recomputePot(state)

  if (remainingContenders(state).length === 1) {
    settleUncontested(state)
  } else if (bettingRoundComplete(state)) {
    advanceStreet(state)
  } else {
    setActor(state, nextIndex(state, index, canAct))
  }
  return state
}

function resetStreet(state: GameState): void {
  for (const player of state.players) {
    player.bet = 0
    player.acted = false
  }
  state.currentBet = 0
  state.minRaise = state.config.bigBlind
}

function dealNextStreet(state: GameState): void {
  state.burned.push(...take(state, 1))
  if (state.phase === 'preflop') {
    state.community.push(...take(state, 3))
    state.phase = 'flop'
    state.log.push(`翻牌 ${state.community.join(' ')}`)
  } else if (state.phase === 'flop') {
    state.community.push(...take(state, 1))
    state.phase = 'turn'
    state.log.push(`转牌 ${state.community.at(-1)}`)
  } else if (state.phase === 'turn') {
    state.community.push(...take(state, 1))
    state.phase = 'river'
    state.log.push(`河牌 ${state.community.at(-1)}`)
  }
}

function advanceStreet(state: GameState): void {
  if (state.phase === 'river') {
    settleShowdown(state)
    return
  }

  resetStreet(state)
  dealNextStreet(state)
  const actor = nextIndex(state, state.dealerIndex, canAct)
  if (actor < 0 || remainingContenders(state).filter(canAct).length <= 1) {
    runOutBoardAndSettle(state)
  } else {
    setActor(state, actor)
  }
}

function runOutBoardAndSettle(state: GameState): void {
  while (state.phase !== 'river') {
    resetStreet(state)
    dealNextStreet(state)
  }
  settleShowdown(state)
}

function award(state: GameState, playerId: string, amount: number, label: string, cards: Card[]): void {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) return
  player.stack += amount
  const existing = state.winners.find((winner) => winner.playerId === playerId)
  if (existing) existing.amount += amount
  else state.winners.push({ playerId, amount, label, cards })
}

function clockwiseFromDealer(state: GameState, ids: string[]): string[] {
  const result: string[] = []
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const player = state.players[(state.dealerIndex + offset) % state.players.length]
    if (ids.includes(player.id)) result.push(player.id)
  }
  return result
}

function settleUncontested(state: GameState): void {
  const winner = remainingContenders(state)[0]
  award(state, winner.id, state.pot, '其他玩家弃牌', winner.hole)
  state.log.push(`${winner.name} 赢得 ${state.pot}`)
  finishHand(state)
}

function settleShowdown(state: GameState): void {
  state.phase = 'showdown'
  state.winners = []
  const levels = [...new Set(state.players.map((player) => player.totalBet).filter((value) => value > 0))]
    .sort((a, b) => a - b)
  let previous = 0

  for (const level of levels) {
    const contributors = state.players.filter((player) => player.totalBet >= level)
    const amount = (level - previous) * contributors.length
    previous = level
    const eligible = contributors.filter((player) => !player.folded)
    if (!eligible.length || amount <= 0) continue

    const ranked = eligible.map((player) => ({
      player,
      hand: evaluateBest([...player.hole, ...state.community]),
    }))
    const best = ranked.reduce((current, candidate) =>
      compareHands(candidate.hand, current.hand) > 0 ? candidate : current,
    )
    const tied = ranked.filter((candidate) => compareHands(candidate.hand, best.hand) === 0)
    const share = Math.floor(amount / tied.length)
    let remainder = amount % tied.length
    const oddChipOrder = clockwiseFromDealer(state, tied.map(({ player }) => player.id))

    for (const candidate of tied) {
      const extra = oddChipOrder.indexOf(candidate.player.id) < remainder ? 1 : 0
      award(state, candidate.player.id, share + extra, candidate.hand.label, candidate.hand.cards)
    }
    remainder = 0
  }

  for (const winner of state.winners) {
    const player = state.players.find((candidate) => candidate.id === winner.playerId)
    state.log.push(`${player?.name ?? '玩家'} 以${winner.label}赢得 ${winner.amount}`)
  }
  finishHand(state)
}

function finishHand(state: GameState): void {
  for (const player of state.players) {
    player.bet = 0
    player.totalBet = 0
    player.acted = false
  }
  state.currentBet = 0
  state.pot = 0
  state.actorIndex = -1
  state.actionDeadline = null
  state.phase = 'complete'
}

/**
 * Returns every seat to the starting stack. A friendly game that has run one
 * player out of chips is over as a tournament but not as an evening, so the
 * table offers a rebuy-all restart rather than forcing a new room.
 */
export function rebuyAll(state: GameState): GameState {
  for (const player of state.players) {
    player.stack = state.config.startingStack
    player.folded = false
    player.allIn = false
    player.bet = 0
    player.totalBet = 0
    player.acted = false
    player.hole = []
    player.lastAction = undefined
  }
  state.phase = 'lobby'
  state.pot = 0
  state.currentBet = 0
  state.community = []
  state.winners = []
  state.actorIndex = -1
  state.actionDeadline = null
  state.log = ['牌局已重新开始，所有玩家恢复初始筹码']
  return state
}

/**
 * Puts a profile in the first free seat. Folded on arrival, so they sit out
 * whatever is currently in play and are dealt in by the next `startHand`.
 *
 * No phase check: callers that need one use `addPlayer`. This exists for the
 * host's mid-hand join queue, which flushes at the exact moment a new hand
 * begins — every seat is about to be reset anyway, so the guard would only
 * reject a seating that is provably safe.
 */
export function seatPlayer(state: GameState, profile: PlayerProfile): PlayerState {
  if (state.players.some((player) => player.id === profile.id)) {
    throw new Error('玩家已在房间中')
  }
  if (state.players.length >= state.config.maxPlayers) throw new Error('房间已满')
  const openSeat = Array.from({ length: state.config.maxPlayers }, (_, seat) => seat)
    .find((seat) => !state.players.some((player) => player.seat === seat))
  if (openSeat === undefined) throw new Error('没有空座位')
  const player: PlayerState = {
    ...profile,
    seat: openSeat,
    stack: state.config.startingStack,
    hole: [],
    folded: true,
    allIn: false,
    bet: 0,
    totalBet: 0,
    acted: false,
    connected: true,
  }
  state.players.push(player)
  return player
}

export function addPlayer(state: GameState, profile: PlayerProfile): PlayerState {
  if (state.phase !== 'lobby' && state.phase !== 'complete') throw new Error('请等待当前手牌结束')
  return seatPlayer(state, profile)
}

export function publicStateFor(state: GameState, viewerId: string): GameState {
  const revealAll = state.phase === 'showdown' || state.phase === 'complete'
  return {
    ...state,
    deck: [],
    burned: [],
    players: state.players.map((player) => ({
      ...player,
      hole: player.id === viewerId || (revealAll && !player.folded) ? [...player.hole] : [],
    })),
  }
}
