<script setup lang="ts">
const props = defineProps<{
  name: string
  src?: string
  size?: 'small' | 'medium' | 'large'
}>()

const palette = [
  { background: '#68e0ba', foreground: '#05291d' },
  { background: '#74a9ff', foreground: '#071b36' },
  { background: '#b08cff', foreground: '#20113f' },
  { background: '#ff8d81', foreground: '#38110d' },
  { background: '#f1c563', foreground: '#302000' },
]
const colors = palette[[...props.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length]
</script>

<template>
  <span
    class="avatar-badge"
    :class="`avatar-badge--${size ?? 'medium'}`"
    :style="{ '--avatar-color': colors.background, '--avatar-foreground': colors.foreground }"
  >
    <img v-if="src" :src="src" :alt="`${name} 的头像`" />
    <span v-else aria-hidden="true">{{ name.trim().slice(0, 1).toUpperCase() }}</span>
  </span>
</template>
