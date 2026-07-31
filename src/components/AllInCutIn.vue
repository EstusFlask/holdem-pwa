<script setup lang="ts">
import { computed } from 'vue'
import type { CutIn } from '../services/animator'

const props = defineProps<{ cutIn: CutIn }>()

/** Each player gets a stable signature hue, the way the reference art does. */
const hue = computed(() => {
  const seed = [...props.cutIn.playerId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return (seed * 47) % 360
})

const initial = computed(() => props.cutIn.name.trim().slice(0, 1).toUpperCase())
const amount = computed(() => props.cutIn.amount.toLocaleString('zh-CN'))
</script>

<template>
  <div
    class="cut-in"
    :style="{ '--cut-hue': hue }"
    role="alert"
    :aria-label="`${cutIn.name} 全下 ${amount}`"
  >
    <div class="cut-in__wash" />
    <div class="cut-in__bands" aria-hidden="true">
      <i v-for="band in 5" :key="band" :style="{ '--i': band }" />
    </div>
    <div class="cut-in__streak" aria-hidden="true" />

    <figure class="cut-in__art">
      <img v-if="cutIn.avatar" class="cut-in__art-wash" :src="cutIn.avatar" alt="" />
      <span v-else class="cut-in__art-wash cut-in__art-wash--blank" aria-hidden="true" />
      <img v-if="cutIn.avatar" class="cut-in__portrait" :src="cutIn.avatar" alt="" />
      <span v-else class="cut-in__portrait cut-in__portrait--blank" aria-hidden="true">{{ initial }}</span>
      <figcaption class="cut-in__name">{{ cutIn.name }}</figcaption>
    </figure>

    <div class="cut-in__copy">
      <strong class="cut-in__title">ALL IN!</strong>
      <span class="cut-in__amount">{{ amount }}</span>
    </div>

    <div class="cut-in__sparks" aria-hidden="true">
      <i v-for="spark in 12" :key="spark" :style="{ '--i': spark }" />
    </div>
  </div>
</template>
