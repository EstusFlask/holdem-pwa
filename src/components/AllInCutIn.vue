<script setup lang="ts">
import { computed } from 'vue'
import { signatureHue, type CutIn } from '../services/animator'

const props = defineProps<{ cutIn: CutIn }>()

/** Each player gets a stable signature hue, the way the reference art does. */
const hue = computed(() => signatureHue(props.cutIn.playerId))

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
    <div class="cut-in__dim" aria-hidden="true" />

    <!-- Thin rips that split off ahead of the main tear. -->
    <div class="cut-in__slivers" aria-hidden="true">
      <i v-for="sliver in 3" :key="sliver" />
    </div>

    <!-- The tear itself: a rim copy behind a gradient fill, both cut to the
         same ragged silhouette, scaled open on the diagonal. -->
    <div class="cut-in__tear" aria-hidden="true">
      <span class="cut-in__tear-rim" />
      <span class="cut-in__tear-fill" />
      <span class="cut-in__tear-streaks">
        <i v-for="streak in 5" :key="streak" :style="{ '--i': streak }" />
      </span>
    </div>

    <figure class="cut-in__art">
      <img v-if="cutIn.avatar" class="cut-in__art-wash" :src="cutIn.avatar" alt="" />
      <span v-else class="cut-in__art-wash cut-in__art-wash--blank" aria-hidden="true" />
      <img v-if="cutIn.avatar" class="cut-in__portrait" :src="cutIn.avatar" alt="" />
      <span v-else class="cut-in__portrait cut-in__portrait--blank" aria-hidden="true">{{ initial }}</span>
      <figcaption class="cut-in__name">{{ cutIn.name }}</figcaption>
    </figure>

    <div class="cut-in__copy">
      <strong class="cut-in__title" data-text="ALL IN!">ALL IN!</strong>
      <span class="cut-in__amount">{{ amount }}</span>
    </div>

    <div class="cut-in__sparks" aria-hidden="true">
      <i v-for="spark in 12" :key="spark" :style="{ '--i': spark }" />
    </div>
  </div>
</template>
