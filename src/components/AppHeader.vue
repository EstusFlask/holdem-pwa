<script setup lang="ts">
import AppIcon from './AppIcon.vue'

const iconSource = `${import.meta.env.BASE_URL}icons/icon-192.png`

defineProps<{
  compact?: boolean
  subtitle?: string
  connected?: boolean
}>()

defineEmits<{
  rules: []
  settings: []
  leave: []
}>()
</script>

<template>
  <header class="app-header" :class="{ 'app-header--compact': compact }">
    <div class="brand-lockup">
      <img :src="iconSource" alt="" class="brand-icon" />
      <strong>Glass Hold’em</strong>
      <template v-if="subtitle">
        <span class="header-divider" />
        <span class="header-subtitle">{{ subtitle }}</span>
        <span class="connection-status">
          <i :class="{ online: connected }" />
          {{ connected ? '点对点连接' : '离线' }}
        </span>
      </template>
    </div>
    <nav class="header-actions" aria-label="应用导航">
      <button class="glass-button glass-button--quiet" type="button" @click="$emit('rules')">
        <AppIcon name="book" /> <span>规则</span>
      </button>
      <button class="glass-button glass-button--quiet" type="button" @click="$emit('settings')">
        <AppIcon name="settings" /> <span>设置</span>
      </button>
      <button
        v-if="compact"
        class="glass-button glass-button--quiet header-leave"
        type="button"
        title="离开牌桌"
        @click="$emit('leave')"
      >
        <AppIcon name="leave" /><span class="sr-only">离开牌桌</span>
      </button>
    </nav>
  </header>
</template>
