<script setup lang="ts">
import { computed } from 'vue'
import CardFace from './CardFace.vue'
import { signatureHue, type Settlement } from '../services/animator'

const props = defineProps<{
  settlement: Settlement
  cardTheme: string
  backTheme: string
}>()

/** Split pots show every winner; the common case is a single hero band. */
const primary = computed(() => props.settlement.winners[0])
const others = computed(() => props.settlement.winners.slice(1))

const hue = computed(() => signatureHue(primary.value?.playerId ?? ''))

const initial = computed(() => (primary.value?.name ?? '').trim().slice(0, 1).toUpperCase())
</script>

<template>
  <div v-if="primary" class="settle" :style="{ '--cut-hue': hue }" role="status">
    <div class="settle__wash" />
    <div class="settle__band">
      <figure class="settle__art">
        <img v-if="primary.avatar" class="settle__art-wash" :src="primary.avatar" alt="" />
        <span v-else class="settle__art-wash settle__art-wash--blank" aria-hidden="true" />
        <img v-if="primary.avatar" class="settle__portrait" :src="primary.avatar" alt="" />
        <span v-else class="settle__portrait settle__portrait--blank" aria-hidden="true">{{ initial }}</span>
        <figcaption class="settle__name">{{ primary.name }}</figcaption>
      </figure>

      <div class="settle__copy">
        <strong class="settle__label">{{ primary.label }}</strong>
        <div class="settle__cards">
          <CardFace
            v-for="(card, index) in primary.cards"
            :key="`${card}-${index}`"
            :card="card"
            :card-theme="cardTheme"
            :back-theme="backTheme"
            :style="{ '--i': index }"
          />
        </div>
        <div class="settle__amount">
          <span class="settle__chip" aria-hidden="true" />
          <strong>{{ primary.amount.toLocaleString('zh-CN') }}</strong>
        </div>
        <p v-if="others.length" class="settle__split">
          平分底池 ·
          <span v-for="winner in others" :key="winner.playerId">
            {{ winner.name }} {{ winner.amount.toLocaleString('zh-CN') }}
          </span>
        </p>
      </div>
    </div>
  </div>
</template>
