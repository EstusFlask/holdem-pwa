<script setup lang="ts">
import { computed } from 'vue'
import { chipAssetUrl, chipBreakdown } from '../services/chips'

const props = withDefaults(defineProps<{
  /** Amount to render as chips. Zero renders nothing. */
  amount: number
  chipTheme: string
  /**
   * Chips drawn per pile before the rest is summarised as "×N". A tall pot would
   * otherwise grow past the board; the count keeps it honest either way.
   */
  maxPerPile?: number
}>(), { maxPerPile: 5 })

const piles = computed(() =>
  chipBreakdown(props.amount).map((pile) => ({
    ...pile,
    src: chipAssetUrl(props.chipTheme, pile.value),
    /** Discs actually drawn, bottom to top. */
    drawn: Array.from({ length: Math.min(pile.count, props.maxPerPile) }, (_, index) => index),
    overflow: pile.count > props.maxPerPile,
  })),
)

const tallest = computed(() => piles.value.reduce((most, pile) => Math.max(most, pile.drawn.length), 0))
</script>

<template>
  <div
    v-if="piles.length"
    class="chip-stack"
    :style="{ '--tallest': tallest }"
    aria-hidden="true"
  >
    <div v-for="pile in piles" :key="pile.value" class="chip-stack__pile">
      <img
        v-for="index in pile.drawn"
        :key="index"
        :src="pile.src"
        alt=""
        :style="{ '--depth': index }"
      />
      <b v-if="pile.overflow">×{{ pile.count }}</b>
    </div>
  </div>
</template>
