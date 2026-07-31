<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerState } from '../game/types'
import type { ActionKind } from '../game/events'
import AvatarBadge from './AvatarBadge.vue'
import CardFace from './CardFace.vue'

const props = withDefaults(defineProps<{
  player: PlayerState
  active: boolean
  isSelf: boolean
  revealHole: boolean
  dealer: boolean
  smallBlind: boolean
  bigBlind: boolean
  cardTheme: string
  backTheme: string
  /** Which side of the name frame the hole cards sit on. */
  cardSide?: 'left' | 'right'
  /** Transient action label floating over the seat, or null between actions. */
  callout?: { action: ActionKind; amount: number } | null
  /** Chips on the plate. The animator owns this while a collect is in flight. */
  bet?: number
  /** Payout floating up as the pot lands in this stack. */
  award?: number
  /** Seconds left to act, for the depleting ring. Null when not acting. */
  secondsLeft?: number | null
  actionSeconds?: number
  /** True while this seat's hole cards are still flying in. */
  dealing?: boolean
  /** Live hand strength, shown under the hero's own cards. Empty for others. */
  strength?: string
}>(), {
  cardSide: 'right',
  callout: null,
  bet: 0,
  award: 0,
  secondsLeft: null,
  actionSeconds: 30,
  dealing: false,
  strength: '',
})

const CALLOUT_COPY: Record<ActionKind, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注至',
  'all-in': '全下',
  blind: '盲注',
}

const shownCards = computed(() => {
  if (props.isSelf || props.revealHole) return props.player.hole
  return props.player.folded ? [] : [undefined, undefined]
})

const calloutText = computed(() => {
  if (!props.callout) return ''
  const copy = CALLOUT_COPY[props.callout.action]
  return props.callout.amount > 0
    ? `${copy} ${props.callout.amount.toLocaleString('zh-CN')}`
    : copy
})

/** Fraction of the action clock still remaining, for the conic ring. */
const clockProgress = computed(() => {
  if (props.secondsLeft === null || !props.actionSeconds) return 0
  return Math.max(0, Math.min(1, props.secondsLeft / props.actionSeconds))
})

const urgent = computed(() => props.secondsLeft !== null && props.secondsLeft <= 8)
</script>

<template>
  <div
    class="player-seat"
    :data-seat-player="player.id"
    :class="[
      `player-seat--cards-${cardSide}`,
      {
        'player-seat--active': active,
        'player-seat--self': isSelf,
        'player-seat--folded': player.folded,
        'player-seat--offline': !player.connected,
        'player-seat--dealing': dealing,
      },
    ]"
  >
    <div v-if="shownCards.length" class="seat-cards">
      <CardFace
        v-for="(card, index) in shownCards"
        :key="`${player.id}-${index}`"
        :card="card"
        :hidden="!isSelf && !revealHole"
        :card-theme="cardTheme"
        :back-theme="backTheme"
        :style="{ '--i': index }"
      />
      <!-- Strength sits under the hero's own cards, as in the reference. -->
      <span v-if="strength" class="seat-strength">{{ strength }}</span>
    </div>
    <div class="seat-body">
      <div class="seat-glass lggc">
        <AvatarBadge :name="player.name" :src="player.avatar" size="small" />
        <div class="seat-copy">
          <strong>{{ isSelf ? '你' : player.name }}</strong>
          <span>{{ player.stack.toLocaleString('zh-CN') }}</span>
        </div>
        <span v-if="dealer" class="position-marker position-marker--dealer">D</span>
        <span v-else-if="smallBlind" class="position-marker">SB</span>
        <span v-else-if="bigBlind" class="position-marker position-marker--big">BB</span>
      </div>

      <div v-if="bet > 0" class="seat-bet" :class="{ 'seat-bet--allin': player.allIn }">
        <span class="mini-chip" />
        {{ bet.toLocaleString('zh-CN') }}
      </div>
    </div>

    <!-- Outside the glass frame: inside it, the panel and the position marker
         overlapped the ring and the countdown could not be read. -->
    <div
      v-if="secondsLeft !== null"
      class="seat-clock"
      :class="{ 'seat-clock--urgent': urgent }"
      :style="{ '--clock-progress': clockProgress }"
      role="timer"
      :aria-label="`剩余 ${secondsLeft} 秒`"
    >
      <span>{{ secondsLeft }}</span>
    </div>

    <div v-if="player.folded" class="seat-fold-mark" aria-hidden="true">FOLD</div>

    <Transition name="callout">
      <div v-if="calloutText" class="seat-callout" :class="`seat-callout--${callout?.action}`">
        {{ calloutText }}
      </div>
    </Transition>

    <Transition name="award">
      <div v-if="award > 0" class="seat-award">+{{ award.toLocaleString('zh-CN') }}</div>
    </Transition>
  </div>
</template>
