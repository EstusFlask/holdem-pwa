<script setup lang="ts">
const props = defineProps<{
  name: string
  src?: string
  size?: 'small' | 'medium' | 'large'
}>()

const palette = ['#68e0ba', '#74a9ff', '#b08cff', '#ff8d81', '#f1c563']
const color = palette[[...props.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]
</script>

<template>
  <span class="avatar-badge" :class="`avatar-badge--${size ?? 'medium'}`" :style="{ '--avatar-color': color }">
    <img v-if="src" :src="src" :alt="`${name} 的头像`" />
    <span v-else aria-hidden="true">{{ name.trim().slice(0, 1).toUpperCase() }}</span>
  </span>
</template>
