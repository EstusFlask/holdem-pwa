<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '../game/types'

const props = withDefaults(defineProps<{
  card?: Card
  hidden?: boolean
  cardTheme?: string
  backTheme?: string
  small?: boolean
}>(), {
  cardTheme: 'default',
  backTheme: 'default',
})

const source = computed(() => {
  if (props.hidden || !props.card) {
    return `${import.meta.env.BASE_URL}assets/card-backs/${props.backTheme}/back.svg`
  }
  const suit = props.card.slice(-1)
  const rank = props.card.slice(0, -1)
  return `${import.meta.env.BASE_URL}assets/cards/${props.cardTheme}/${suit}-${rank}.svg`
})

const label = computed(() => {
  if (props.hidden || !props.card) return '牌背'
  const suitLabels: Record<string, string> = { S: '黑桃', H: '红心', D: '方块', C: '梅花' }
  return `${suitLabels[props.card.slice(-1)]}${props.card.slice(0, -1)}`
})
</script>

<template>
  <img
    class="playing-card"
    :class="{ 'playing-card--small': small, 'playing-card--back': hidden || !card }"
    :src="source"
    :alt="label"
    draggable="false"
  />
</template>
