<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import CardFace from '../components/CardFace.vue'
import PlayerSeat from '../components/PlayerSeat.vue'
import type { GameState, LegalActions, PlayerAction } from '../game/types'
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
const showHistory = ref(false)
const clock = window.setInterval(() => { now.value = Date.now() }, 250)

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
  props.legal.canFold || props.legal.canCheck || props.legal.canCall || props.legal.canRaise,
)
const orderedPlayers = computed(() => {
  const sorted = [...props.game.players].sort((a, b) => a.seat - b.seat)
  const selfIndex = sorted.findIndex((player) => player.id === props.selfId)
  return selfIndex < 0 ? sorted : [...sorted.slice(selfIndex), ...sorted.slice(0, selfIndex)]
})
const boardSlots = computed(() => [
  ...props.game.community,
  ...Array<undefined>(5 - props.game.community.length).fill(undefined),
])
const chipSource = computed(() =>
  `${import.meta.env.BASE_URL}assets/chips/${props.settings.chipTheme}/chips.svg`,
)
const statusCopy = computed(() => {
  if (props.game.phase === 'lobby') return '等待玩家入座'
  if (props.game.phase === 'complete') return props.game.winners
    .map((winner) => {
      const player = props.game.players.find((candidate) => candidate.id === winner.playerId)
      return `${player?.name ?? '玩家'} · ${winner.label} +${winner.amount}`
    })
    .join('  ·  ')
  const actor = props.game.players[props.game.actorIndex]
  return actor?.id === props.selfId ? '轮到你行动' : actor ? `等待 ${actor.name}` : phaseLabel.value
})

watch(
  () => [props.legal.minRaiseTo, props.legal.maxRaiseTo],
  () => {
    raiseTo.value = Math.max(props.legal.minRaiseTo, Math.min(raiseTo.value || props.legal.minRaiseTo, props.legal.maxRaiseTo))
  },
  { immediate: true },
)

function positionClass(index: number, count: number): string {
  if (index === 0) return 'seat-slot--0'
  const slotMap: Record<number, number[]> = {
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
  return `seat-slot--${slotMap[count]?.[index] ?? index}`
}

function quickBet(multiplier: number): void {
  const target = multiplier === 0
    ? props.legal.minRaiseTo
    : Math.round((props.game.pot * multiplier) / props.game.config.bigBlind) * props.game.config.bigBlind
  raiseTo.value = Math.max(props.legal.minRaiseTo, Math.min(target, props.legal.maxRaiseTo))
}

function submit(action: PlayerAction): void {
  emit('action', { action, raiseTo: action === 'raise' ? raiseTo.value : undefined })
}

onBeforeUnmount(() => window.clearInterval(clock))
</script>

<template>
  <section class="table-view">
    <div class="table-stage">
      <div class="poker-table">
        <div class="table-felt">
          <div class="table-watermark">GH</div>
          <div class="pot-display lggc">
            <span>底池</span>
            <strong>{{ game.pot.toLocaleString('zh-CN') }}</strong>
          </div>
          <div class="community-cards">
            <CardFace
              v-for="(card, index) in boardSlots"
              :key="`board-${index}-${card ?? 'empty'}`"
              :card="card"
              :card-theme="settings.cardTheme"
              :back-theme="settings.backTheme"
              :class="{ 'playing-card--empty': !card }"
            />
          </div>
          <img
            v-if="game.pot > 0"
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
          :reveal-hole="game.phase === 'showdown' || game.phase === 'complete'"
          :dealer="game.dealerIndex >= 0 && game.players[game.dealerIndex]?.id === player.id"
          :small-blind="game.smallBlindIndex >= 0 && game.players[game.smallBlindIndex]?.id === player.id"
          :big-blind="game.bigBlindIndex >= 0 && game.players[game.bigBlindIndex]?.id === player.id"
          :card-theme="settings.cardTheme"
          :back-theme="settings.backTheme"
        />
      </div>

      <div v-if="game.actorIndex >= 0" class="turn-clock" :class="{ urgent: timeLeft <= 8 }">
        {{ timeLeft }}
      </div>

      <aside v-if="showHistory" class="history-rail lggc">
        <div class="history-header">
          <strong>牌局记录</strong>
          <button type="button" aria-label="收起记录" @click="showHistory = false">×</button>
        </div>
        <div class="history-items">
          <p v-for="(entry, index) in [...game.log].reverse()" :key="`${entry}-${index}`">{{ entry }}</p>
        </div>
      </aside>
      <button v-else class="history-toggle lggc" type="button" @click="showHistory = true">记录</button>
    </div>

    <div class="table-status">
      <span :class="{ 'your-turn': game.players[game.actorIndex]?.id === selfId }">{{ statusCopy }}</span>
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

    <div v-if="game.phase === 'lobby' || game.phase === 'complete'" class="between-hands lggc">
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

    <div v-else class="action-dock lggc" :class="{ disabled: !actionEnabled }">
      <div class="action-buttons">
        <button class="action-button action-button--fold" type="button" :disabled="!legal.canFold" @click="submit('fold')">弃牌</button>
        <button class="action-button action-button--check" type="button" :disabled="!legal.canCheck" @click="submit('check')">过牌</button>
        <button class="action-button" type="button" :disabled="!legal.canCall" @click="submit('call')">
          跟注 <strong v-if="legal.canCall">{{ legal.toCall }}</strong>
        </button>
        <button class="action-button action-button--raise" type="button" :disabled="!legal.canRaise" @click="submit('raise')">
          加注至 <strong>{{ raiseTo }}</strong>
        </button>
      </div>
      <div class="raise-controls">
        <button type="button" :disabled="!legal.canRaise" @click="raiseTo = Math.max(legal.minRaiseTo, raiseTo - game.config.bigBlind)">−</button>
        <output>{{ raiseTo }}</output>
        <button type="button" :disabled="!legal.canRaise" @click="raiseTo = Math.min(legal.maxRaiseTo, raiseTo + game.config.bigBlind)">＋</button>
        <input
          v-model.number="raiseTo"
          type="range"
          :min="legal.minRaiseTo"
          :max="Math.max(legal.minRaiseTo, legal.maxRaiseTo)"
          :step="game.config.bigBlind"
          :disabled="!legal.canRaise"
          aria-label="加注金额"
        />
        <div class="quick-bets">
          <button type="button" :disabled="!legal.canRaise" @click="quickBet(0)">最小</button>
          <button type="button" :disabled="!legal.canRaise" @click="quickBet(.5)">1/2 底池</button>
          <button type="button" :disabled="!legal.canRaise" @click="quickBet(1)">底池</button>
          <button type="button" :disabled="!legal.canRaise" @click="raiseTo = legal.maxRaiseTo">全下</button>
        </div>
      </div>
    </div>
  </section>
</template>
