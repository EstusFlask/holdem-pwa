<script setup lang="ts">
import { computed } from 'vue'
import type { PlayerState } from '../game/types'
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
}>(), {
  cardSide: 'right',
})

const shownCards = computed(() => {
  if (props.isSelf || props.revealHole) return props.player.hole
  return props.player.folded ? [] : [undefined, undefined]
})
</script>

<template>
  <div
    class="player-seat"
    :class="[
      `player-seat--cards-${cardSide}`,
      {
        'player-seat--active': active,
        'player-seat--self': isSelf,
        'player-seat--folded': player.folded,
        'player-seat--offline': !player.connected,
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
      />
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
      <div v-if="player.lastAction" class="seat-action">{{ player.lastAction }}</div>
      <div v-if="player.bet > 0" class="seat-bet">
        <span class="mini-chip" />
        {{ player.bet }}
      </div>
    </div>
  </div>
</template>
