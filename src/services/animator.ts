import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { diffGameState, type ActionKind, type TableEvent } from '../game/events'
import type { Card, GameState, Winner } from '../game/types'

export interface Callout {
  id: number
  playerId: string
  action: ActionKind
  amount: number
}

export interface CutIn {
  id: number
  playerId: string
  name: string
  avatar: string
  amount: number
}

export interface ChipFlight {
  id: number
  playerId: string
  amount: number
}

export interface SettlementWinner {
  playerId: string
  name: string
  avatar: string
  amount: number
  label: string
  cards: Card[]
}

export interface Settlement {
  id: number
  winners: SettlementWinner[]
  pot: number
}

/** Beat lengths in ms, read off the reference video frame by frame. */
const T = {
  callout: 420,
  calloutHold: 620,
  cutIn: 1750,
  collect: 620,
  potCount: 420,
  flopCard: 240,
  flopSettle: 260,
  street: 520,
  spotlight: 1500,
  reveal: 560,
  settleIn: 700,
  settleHold: 3000,
  settleOut: 600,
  award: 720,
  deal: 1150,
} as const

/** Past this backlog the queue stops savouring callouts and keeps only structure. */
const BACKLOG_LIMIT = 9

/**
 * Signature hues for cinematic overlays.
 *
 * Deliberately excludes greens: the felt is emerald, and a green cut-in washes
 * into the table behind it instead of cutting across it. The reference palette is
 * magenta through violet into blue, which is what reads against green.
 */
const SIGNATURE_HUES = [318, 292, 268, 336, 248, 210, 352, 228] as const

/** Stable per-player overlay hue, derived from the id so it never shifts. */
export function signatureHue(playerId: string): number {
  const seed = [...playerId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return SIGNATURE_HUES[seed % SIGNATURE_HUES.length]
}

/**
 * Drives every table animation from successive `GameState` snapshots.
 *
 * The rendered state is the real state, with four display overrides the queue
 * owns while a sequence plays: how much of the board is visible, what the pot
 * reads, what sits on the bet plates, and whose hole cards are face up. That
 * matters because the engine settles a hand in one synchronous step — board,
 * showdown and payout all land together with the pot already cleared — so the
 * queue has to re-expand that into the beats the video shows.
 *
 * `busy` is true while a sequence is mid-flight; the dock stays hidden until it
 * drains so a player can never act on a state they have not been shown yet.
 */
export function useTableAnimation(game: Ref<GameState | null>, reduceMotion: Ref<boolean>) {
  const boardShown = ref(0)
  const displayPot = ref(0)
  const displayBets = shallowRef<Map<string, number> | null>(null)
  const revealIds = shallowRef<Set<string>>(new Set())
  const callouts = shallowRef<Callout[]>([])
  const cutIn = shallowRef<CutIn | null>(null)
  const settlement = shallowRef<Settlement | null>(null)
  const flights = shallowRef<ChipFlight[]>([])
  const awards = shallowRef<Map<string, number>>(new Map())
  const dealing = ref(0)
  const spotlight = ref(false)
  const busy = ref(false)
  /**
   * True only while a settlement burst is on screen. The dock keys off this
   * rather than `busy`, so an ordinary opponent callout does not blink it away.
   */
  const settling = ref(false)

  const queue: TableEvent[] = []
  const timers = new Set<number>()
  let previous: GameState | null = null
  let running = false
  let potTween = 0

  /** Beat length honouring the user's reduce-motion preference. */
  function beat(ms: number): number {
    return reduceMotion.value ? Math.min(16, ms) : ms
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, beat(ms))
      timers.add(timer)
    })
  }

  function clearTimers(): void {
    for (const timer of timers) window.clearTimeout(timer)
    timers.clear()
    window.clearInterval(potTween)
  }

  /** Counts the pot label up so a collect reads as chips arriving, not a jump. */
  function tweenPot(to: number): void {
    window.clearInterval(potTween)
    const from = displayPot.value
    if (reduceMotion.value || from === to) {
      displayPot.value = to
      return
    }
    const started = performance.now()
    const span = beat(T.potCount)
    potTween = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - started) / span)
      displayPot.value = Math.round(from + (to - from) * (1 - (1 - progress) ** 3))
      if (progress >= 1) window.clearInterval(potTween)
    }, 16)
  }

  function snap(state: GameState | null): void {
    clearTimers()
    queue.length = 0
    running = false
    busy.value = false
    boardShown.value = state?.community.length ?? 0
    displayPot.value = state?.pot ?? 0
    displayBets.value = null
    revealIds.value = new Set()
    callouts.value = []
    cutIn.value = null
    settlement.value = null
    flights.value = []
    awards.value = new Map()
    dealing.value = 0
    spotlight.value = false
    settling.value = false
  }

  function playerById(id: string) {
    return game.value?.players.find((player) => player.id === id)
  }

  async function playAction(event: Extract<TableEvent, { kind: 'action' }>): Promise<void> {
    const player = playerById(event.playerId)
    if (!player) return

    if (event.action === 'all-in') {
      cutIn.value = {
        id: event.id,
        playerId: event.playerId,
        name: player.name,
        avatar: player.avatar,
        amount: event.amount,
      }
      await sleep(T.cutIn)
      cutIn.value = null
      return
    }

    const callout: Callout = {
      id: event.id,
      playerId: event.playerId,
      action: event.action,
      amount: event.amount,
    }
    callouts.value = [...callouts.value, callout]
    await sleep(queue.length > BACKLOG_LIMIT ? T.callout / 2 : T.calloutHold)
    callouts.value = callouts.value.filter((entry) => entry.id !== callout.id)
  }

  async function playCollect(event: Extract<TableEvent, { kind: 'collect' }>): Promise<void> {
    displayBets.value = new Map(event.contributions.map(({ playerId, amount }) => [playerId, amount]))
    await sleep(60)
    flights.value = event.contributions.map(({ playerId, amount }, index) => ({
      id: event.id * 100 + index,
      playerId,
      amount,
    }))
    displayBets.value = new Map()
    tweenPot(event.potTo)
    await sleep(T.collect)
    flights.value = []
    displayBets.value = null
    displayPot.value = event.potTo
  }

  async function playBoard(event: Extract<TableEvent, { kind: 'board' }>): Promise<void> {
    if (event.street === 'flop') {
      for (let shown = boardShown.value + 1; shown <= event.shown; shown += 1) {
        boardShown.value = shown
        await sleep(T.flopCard)
      }
      await sleep(T.flopSettle)
      return
    }

    // The river of an all-in run-out is the money card: dim the room, gather the
    // light on the board, then flash it in. Earlier streets just land.
    const isShowdownRiver = event.street === 'river' && game.value?.phase === 'complete'
    if (isShowdownRiver) {
      spotlight.value = true
      await sleep(T.spotlight)
    }
    boardShown.value = event.shown
    await sleep(isShowdownRiver ? T.street + 260 : T.street)
    spotlight.value = false
  }

  async function playReveal(event: Extract<TableEvent, { kind: 'reveal' }>): Promise<void> {
    revealIds.value = new Set(event.playerIds)
    await sleep(T.reveal)
  }

  async function playSettle(event: Extract<TableEvent, { kind: 'settle' }>): Promise<void> {
    const winners: SettlementWinner[] = event.winners.map((winner: Winner) => {
      const player = playerById(winner.playerId)
      return {
        playerId: winner.playerId,
        name: player?.name ?? '玩家',
        avatar: player?.avatar ?? '',
        amount: winner.amount,
        label: winner.label,
        cards: winner.cards,
      }
    })
    settlement.value = { id: event.id, winners, pot: event.pot }
    await sleep(T.settleIn + T.settleHold)
    settlement.value = null
    await sleep(T.settleOut)
  }

  async function playAward(event: Extract<TableEvent, { kind: 'award' }>): Promise<void> {
    awards.value = new Map(event.payouts.map(({ playerId, amount }) => [playerId, amount]))
    tweenPot(0)
    await sleep(T.award)
    awards.value = new Map()
    displayPot.value = 0
  }

  async function playDeal(event: Extract<TableEvent, { kind: 'deal' }>): Promise<void> {
    boardShown.value = 0
    displayPot.value = 0
    revealIds.value = new Set()
    dealing.value = event.playerIds.length
    await sleep(T.deal)
    dealing.value = 0
    displayPot.value = game.value?.pot ?? 0
  }

  async function pump(): Promise<void> {
    if (running) return
    running = true
    busy.value = true
    while (queue.length) {
      const event = queue.shift()
      if (!event) break
      if (event.kind === 'action') await playAction(event)
      else if (event.kind === 'collect') await playCollect(event)
      else if (event.kind === 'board') await playBoard(event)
      else if (event.kind === 'reveal') await playReveal(event)
      else if (event.kind === 'settle') await playSettle(event)
      else if (event.kind === 'award') await playAward(event)
      else if (event.kind === 'deal') await playDeal(event)
    }
    running = false
    busy.value = false
    settling.value = false
    // Whatever the queue was overriding hands back to the live state.
    const state = game.value
    if (state) {
      boardShown.value = state.community.length
      displayPot.value = state.pot
      displayBets.value = null
    }
  }

  /**
   * Structural copy of a snapshot.
   *
   * Local practice mutates the engine state in place and then hands over a
   * shallow clone, so the nested `players` array stays reference-identical
   * between renders. Holding the live object as "previous" would therefore diff
   * a snapshot against its own mutated self and see nothing — which is exactly
   * why practice showed no effects while networked play (where every snapshot
   * arrives freshly deserialised) did.
   */
  function freeze(state: GameState): GameState {
    return JSON.parse(JSON.stringify(state)) as GameState
  }

  watch(game, (next) => {
    if (!next) {
      previous = null
      snap(null)
      return
    }
    if (!previous) {
      previous = freeze(next)
      snap(next)
      return
    }

    const events = diffGameState(previous, next)
    previous = freeze(next)
    if (!events.length) {
      // Not a comparable transition (fresh hand for a rejoining peer, a dropped
      // snapshot, a board that went backwards): show the truth, animate nothing.
      if (!running) snap(next)
      return
    }
    queue.push(...events)
    if (events.some((event) => event.kind === 'settle')) settling.value = true
    void pump()
  }, { deep: false })

  onBeforeUnmount(clearTimers)

  /**
   * Bet plate amounts to render. The queue takes over during a collect so plates
   * can linger and fly away after the engine has already zeroed `player.bet`.
   */
  const seatBets = computed<Map<string, number>>(() => {
    if (displayBets.value) return displayBets.value
    const state = game.value
    if (!state) return new Map()
    return new Map(
      state.players.filter((player) => player.bet > 0).map((player) => [player.id, player.bet]),
    )
  })

  /**
   * Pot excluding chips still sitting on the plates in front of the seats —
   * `state.pot` counts those, so showing it raw double-counts the live street.
   */
  const potOnFelt = computed(() => {
    if (displayBets.value) return displayPot.value
    const state = game.value
    if (!state) return 0
    const live = state.players.reduce((sum, player) => sum + player.bet, 0)
    return Math.max(0, (running ? displayPot.value : state.pot) - live)
  })

  return {
    boardShown,
    potOnFelt,
    seatBets,
    revealIds,
    callouts,
    cutIn,
    settlement,
    flights,
    awards,
    dealing,
    spotlight,
    busy,
    settling,
  }
}

