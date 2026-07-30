export const SUITS = ['S', 'H', 'D', 'C'] as const
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]
export type Card = `${Rank}${Suit}`
export type GamePhase = 'lobby' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete'
export type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in'

export interface GameConfig {
  roomName: string
  startingStack: number
  smallBlind: number
  bigBlind: number
  maxPlayers: number
  actionSeconds: number
}

export interface PlayerProfile {
  id: string
  name: string
  avatar: string
}

export interface PlayerState extends PlayerProfile {
  seat: number
  stack: number
  hole: Card[]
  folded: boolean
  allIn: boolean
  bet: number
  totalBet: number
  acted: boolean
  connected: boolean
  lastAction?: string
}

export interface Winner {
  playerId: string
  amount: number
  label: string
  cards: Card[]
}

export interface GameState {
  roomCode: string
  config: GameConfig
  phase: GamePhase
  handNumber: number
  players: PlayerState[]
  dealerIndex: number
  smallBlindIndex: number
  bigBlindIndex: number
  actorIndex: number
  community: Card[]
  deck: Card[]
  burned: Card[]
  currentBet: number
  minRaise: number
  pot: number
  winners: Winner[]
  log: string[]
  actionDeadline: number | null
}

export interface LegalActions {
  canFold: boolean
  canCheck: boolean
  canCall: boolean
  canRaise: boolean
  toCall: number
  minRaiseTo: number
  maxRaiseTo: number
}

export type RandomInt = (maxExclusive: number) => number
