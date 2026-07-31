<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import AllInCutIn from '../components/AllInCutIn.vue'
import AppIcon from '../components/AppIcon.vue'
import CardFace from '../components/CardFace.vue'
import ChipFlightLayer from '../components/ChipFlightLayer.vue'
import PlayerSeat from '../components/PlayerSeat.vue'
import SettlementBanner from '../components/SettlementBanner.vue'
import { evaluateBest } from '../game/evaluator'
import type { GameState, LegalActions, PlayerAction } from '../game/types'
import { useTableAnimation, type Callout } from '../services/animator'
import type { LocalSettings } from '../services/storage'

const props = defineProps<{
  game: GameState
  legal: LegalActions
  selfId: string
  isHost: boolean
  isLocalPractice: boolean
  settings: LocalSettings
}>()

const emit = defineEmits<{
  action: [payload: { action: PlayerAction; raiseTo?: number }]
  startHand: []
  invite: []
}>()

const now = ref(Date.now())
const raiseTo = ref(0)
const betPanelOpen = ref(false)
const stage = ref<HTMLElement | null>(null)
const clock = window.setInterval(() => { now.value = Date.now() }, 250)

const {
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
} = useTableAnimation(
  computed(() => props.game),
  toRef(props.settings, 'reduceMotion'),
)

const phaseLabel = computed(() => ({
  lobby: '等待开始',
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '摊牌',
  complete: '本手结束',
}[props.game.phase]))

const timeLeft = computed(() => Math.max(0, Math.ceil(((props.game.actionDeadline ?? now.value) - now.value) / 1000)))
const actionEnabled = computed(() =>
  !busy.value
  && (props.legal.canFold || props.legal.canCheck || props.legal.canCall || props.legal.canRaise),
)
const orderedPlayers = computed(() => {
  const sorted = [...props.game.players].sort((a, b) => a.seat - b.seat)
  const selfIndex = sorted.findIndex((player) => player.id === props.selfId)
  return selfIndex < 0 ? sorted : [...sorted.slice(selfIndex), ...sorted.slice(0, selfIndex)]
})

/** Board slots respect the reveal queue, so cards land one at a time. */
const boardSlots = computed(() => {
  const shown = props.game.community.slice(0, boardShown.value)
  return [...shown, ...Array<undefined>(5 - shown.length).fill(undefined)]
})

const chipSource = computed(() =>
  `${import.meta.env.BASE_URL}assets/chips/${props.settings.chipTheme}/chips.svg`,
)

const self = computed(() => props.game.players.find((player) => player.id === props.selfId))

/** Live strength of the hero's holding, the way the reference shows it. */
const handStrength = computed(() => {
  const hole = self.value?.hole ?? []
  if (hole.length < 2) return ''
  const visible = [...hole, ...props.game.community.slice(0, boardShown.value)]
  if (visible.length >= 5) return evaluateBest(visible).label
  return hole[0].slice(0, -1) === hole[1].slice(0, -1) ? '一对' : '高牌'
})

const statusCopy = computed(() => {
  if (props.game.phase === 'lobby') return '等待玩家入座'
  if (busy.value) return '结算中'
  if (props.game.phase === 'complete') return props.game.winners
    .map((winner) => {
      const player = props.game.players.find((candidate) => candidate.id === winner.playerId)
      return `${player?.name ?? '玩家'} · ${winner.label} +${winner.amount}`
    })
    .join('  ·  ')
  const actor = props.game.players[props.game.actorIndex]
  return actor?.id === props.selfId ? '轮到你行动' : actor ? `等待 ${actor.name}` : phaseLabel.value
})

const isMyTurn = computed(() => props.game.players[props.game.actorIndex]?.id === props.selfId)
const calloutFor = computed(() => {
  const map = new Map<string, { action: Callout['action']; amount: number }>()
  for (const callout of callouts.value) {
    map.set(callout.playerId, { action: callout.action, amount: callout.amount })
  }
  return map
})

/** The middle dock slot is check-or-call: they are mutually exclusive. */
const middleAction = computed<'check' | 'call'>(() => (props.legal.canCall ? 'call' : 'check'))
const raiseIsBet = computed(() => props.game.currentBet === 0)
const canOpenPanel = computed(() => props.legal.canRaise && !busy.value)

watch(
  () => [props.legal.minRaiseTo, props.legal.maxRaiseTo],
  () => {
    raiseTo.value = Math.max(props.legal.minRaiseTo, Math.min(raiseTo.value || props.legal.minRaiseTo, props.legal.maxRaiseTo))
  },
  { immediate: true },
)

watch(isMyTurn, (mine) => { if (!mine) betPanelOpen.value = false })

const SLOT_MAP: Record<number, number[]> = {
  2: [0, 5],
  3: [0, 3, 7],
  4: [0, 2, 5, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 4, 5, 7, 9],
  7: [0, 1, 3, 4, 6, 7, 9],
  8: [0, 1, 2, 4, 5, 7, 8, 9],
  9: [0, 1, 2, 3, 4, 6, 7, 8, 9],
  10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
}

/** Seats 6–8 hug the right rail, so their hole cards sit on the inner (left) side. */
const RIGHT_RAIL_SLOTS = new Set([6, 7, 8])

function slotIndex(index: number, count: number): number {
  if (index === 0) return 0
  return SLOT_MAP[count]?.[index] ?? index
}

function positionClass(index: number, count: number): string {
  return `seat-slot--${slotIndex(index, count)}`
}

function cardSide(index: number, count: number): 'left' | 'right' {
  return RIGHT_RAIL_SLOTS.has(slotIndex(index, count)) ? 'left' : 'right'
}

/** Preset sizings, mirroring the reference panel's stacked shortcuts. */
const PRESETS = [
  { label: '最小', factor: 0 },
  { label: '1/3 底池', factor: 1 / 3 },
  { label: '1/2 底池', factor: 0.5 },
  { label: '底池', factor: 1 },
] as const

function presetAmount(factor: number): number {
  const target = factor === 0
    ? props.legal.minRaiseTo
    : Math.round((props.game.pot * factor) / props.game.config.bigBlind) * props.game.config.bigBlind
  return Math.max(props.legal.minRaiseTo, Math.min(target, props.legal.maxRaiseTo))
}

function applyPreset(factor: number): void {
  raiseTo.value = presetAmount(factor)
}

function submit(action: PlayerAction): void {
  betPanelOpen.value = false
  emit('action', { action, raiseTo: action === 'raise' ? raiseTo.value : undefined })
}

function toggleBetPanel(): void {
  if (!canOpenPanel.value) return
  betPanelOpen.value = !betPanelOpen.value
}

onBeforeUnmount(() => window.clearInterval(clock))
</script>

<template>
  <section class="table-view" :class="`table-view--${orderedPlayers.length}-handed`">
    <div ref="stage" class="table-stage" :class="{ 'table-stage--spotlight': spotlight }">
      <div class="poker-table">
        <div class="table-felt">
          <div class="table-watermark">GH</div>
          <div class="pot-display lggc">
            <span>底池</span>
            <strong>{{ potOnFelt.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="community-cards">
            <CardFace
              v-for="(card, index) in boardSlots"
              :key="`board-${index}-${card ?? 'empty'}`"
              :card="card"
              :card-theme="settings.cardTheme"
              :back-theme="settings.backTheme"
              :class="{ 'playing-card--empty': !card, 'playing-card--dealt': card }"
              :style="{ '--i': index }"
            />
          </div>
          <img
            v-if="potOnFelt > 0"
            class="pot-chip-art"
            :src="chipSource"
            alt=""
          />
          <span class="street-label">{{ phaseLabel }}</span>
        </div>
      </div>

      <div
        v-for="(player, index) in orderedPlayers"
        :key="player.id"
        class="seat-slot"
        :class="positionClass(index, orderedPlayers.length)"
      >
        <PlayerSeat
          :player="player"
          :active="game.actorIndex >= 0 && game.players[game.actorIndex]?.id === player.id"
          :is-self="player.id === selfId"
          :reveal-hole="revealIds.has(player.id) || (game.phase === 'complete' && !busy)"
          :dealer="game.dealerIndex >= 0 && game.players[game.dealerIndex]?.id === player.id"
          :small-blind="game.smallBlindIndex >= 0 && game.players[game.smallBlindIndex]?.id === player.id"
          :big-blind="game.bigBlindIndex >= 0 && game.players[game.bigBlindIndex]?.id === player.id"
          :card-theme="settings.cardTheme"
          :back-theme="settings.backTheme"
          :card-side="cardSide(index, orderedPlayers.length)"
          :callout="calloutFor.get(player.id) ?? null"
          :bet="seatBets.get(player.id) ?? 0"
          :award="awards.get(player.id) ?? 0"
          :seconds-left="
            game.actorIndex >= 0 && game.players[game.actorIndex]?.id === player.id && !busy
              ? timeLeft
              : null
          "
          :action-seconds="game.config.actionSeconds"
          :dealing="dealing > 0"
        />
      </div>

      <ChipFlightLayer :flights="flights" :stage="stage" :chip-src="chipSource" />
    </div>

    <div class="table-status">
      <span :class="{ 'your-turn': isMyTurn && !busy }">{{ statusCopy }}</span>
      <button
        v-if="game.roomCode !== 'OFFLINE'"
        type="button"
        :disabled="!isHost"
        @click="$emit('invite')"
      >
        <AppIcon :name="isHost ? 'qr' : 'check'" />
        {{ isHost ? '邀请玩家' : '点对点房间' }} · #{{ game.roomCode }}
      </button>
    </div>

    <div
      v-if="(game.phase === 'lobby' || game.phase === 'complete') && !busy"
      class="between-hands lggc"
    >
      <div>
        <strong>{{ game.phase === 'lobby' ? `已有 ${game.players.length} 人入座` : '准备好下一手' }}</strong>
        <span v-if="game.phase === 'lobby'">至少两名玩家即可开始</span>
        <span v-else>{{ statusCopy }}</span>
      </div>
      <button
        v-if="isHost"
        class="primary-action primary-action--green"
        type="button"
        :disabled="game.players.filter((player) => player.connected && player.stack > 0).length < 2"
        @click="$emit('startHand')"
      >
        <AppIcon name="play" /> {{ game.phase === 'lobby' ? '开始牌局' : '发下一手' }}
      </button>
      <span v-else>等待房主发牌</span>
    </div>

    <div v-else-if="!busy" class="action-dock" :class="{ disabled: !actionEnabled }">
      <p v-if="handStrength" class="hand-strength">
        <span>{{ handStrength }}</span>
      </p>

      <Transition name="bet-panel">
        <div v-if="betPanelOpen" class="bet-panel lggc">
          <div class="bet-presets">
            <button
              v-for="preset in PRESETS"
              :key="preset.label"
              type="button"
              class="bet-preset"
              @click="applyPreset(preset.factor)"
            >
              <em>{{ presetAmount(preset.factor).toLocaleString('zh-CN') }}</em>
              {{ preset.label }}
            </button>
            <button type="button" class="bet-preset bet-preset--allin" @click="raiseTo = legal.maxRaiseTo">
              <em>{{ legal.maxRaiseTo.toLocaleString('zh-CN') }}</em>
              全下
            </button>
          </div>

          <div class="bet-slider">
            <button
              type="button"
              aria-label="增加"
              @click="raiseTo = Math.min(legal.maxRaiseTo, raiseTo + game.config.bigBlind)"
            >＋</button>
            <input
              v-model.number="raiseTo"
              type="range"
              :min="legal.minRaiseTo"
              :max="Math.max(legal.minRaiseTo, legal.maxRaiseTo)"
              :step="game.config.bigBlind"
              aria-label="加注金额"
            />
            <button
              type="button"
              aria-label="减少"
              @click="raiseTo = Math.max(legal.minRaiseTo, raiseTo - game.config.bigBlind)"
            >−</button>
          </div>
        </div>
      </Transition>

      <div class="action-buttons">
        <button
          class="action-button action-button--fold"
          type="button"
          :disabled="!legal.canFold"
          @click="submit('fold')"
        >弃牌</button>

        <button
          class="action-button action-button--call"
          type="button"
          :disabled="middleAction === 'call' ? !legal.canCall : !legal.canCheck"
          @click="submit(middleAction)"
        >
          {{ middleAction === 'call' ? '跟注' : '过牌' }}
          <strong v-if="middleAction === 'call' && legal.canCall">{{ legal.toCall.toLocaleString('zh-CN') }}</strong>
        </button>

        <button
          class="action-button action-button--raise"
          type="button"
          :class="{ 'action-button--open': betPanelOpen }"
          :disabled="!legal.canRaise"
          :aria-expanded="betPanelOpen"
          @click="toggleBetPanel"
        >
          {{ raiseIsBet ? '下注' : '加注' }}
          <strong>{{ raiseTo.toLocaleString('zh-CN') }}</strong>
        </button>
      </div>

      <button
        v-if="betPanelOpen"
        class="bet-confirm primary-action primary-action--violet"
        type="button"
        @click="submit('raise')"
      >
        确认{{ raiseIsBet ? '下注' : '加注' }} {{ raiseTo.toLocaleString('zh-CN') }}
      </button>
    </div>

    <Transition name="cut-in">
      <AllInCutIn v-if="cutIn" :cut-in="cutIn" />
    </Transition>

    <Transition name="settle">
      <SettlementBanner
        v-if="settlement"
        :settlement="settlement"
        :card-theme="settings.cardTheme"
        :back-theme="settings.backTheme"
      />
    </Transition>
  </section>
</template>
