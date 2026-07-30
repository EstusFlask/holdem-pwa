<script setup lang="ts">
defineProps<{
  name:
    | 'book'
    | 'settings'
    | 'leave'
    | 'users'
    | 'enter'
    | 'server'
    | 'share'
    | 'wifi'
    | 'play'
    | 'eye'
    | 'chevron-left'
    | 'chevron-right'
    | 'check'
    | 'alert'
    | 'profile'
    | 'palette'
    | 'cards'
    | 'gamepad'
    | 'info'
    | 'back'
    | 'refresh'
    | 'copy'
    | 'upload'
    | 'qr'
    | 'camera'
    | 'image'
}>()
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <template v-if="name === 'book'">
        <path d="M4 5.2c2.7-.8 5.3-.2 8 1.5v12c-2.7-1.7-5.3-2.3-8-1.5z" />
        <path d="M20 5.2c-2.7-.8-5.3-.2-8 1.5v12c2.7-1.7 5.3-2.3 8-1.5z" />
      </template>
      <template v-else-if="name === 'settings'">
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.1 13.8l1.1 1.1-1.8 3.1-1.5-.4a8 8 0 0 1-2.1 1.2l-.4 1.5h-3.6l-.4-1.5a8 8 0 0 1-2.1-1.2l-1.5.4L5 14.9l1.1-1.1a8 8 0 0 1 0-2.5L5 10.2l1.8-3.1 1.5.4a8 8 0 0 1 2.1-1.2l.4-1.5h3.6l.4 1.5a8 8 0 0 1 2.1 1.2l1.5-.4 1.8 3.1-1.1 1.1a8 8 0 0 1 0 2.5z" />
      </template>
      <template v-else-if="name === 'leave'">
        <path d="M10 5H5v14h5" /><path d="M14 8l4 4-4 4M8 12h10" />
      </template>
      <template v-else-if="name === 'users'">
        <path d="M16 18v-1.4c0-2-1.8-3.6-4-3.6H7c-2.2 0-4 1.6-4 3.6V18" />
        <circle cx="9.5" cy="7.5" r="3" />
        <path d="M16 6.1a3 3 0 0 1 0 5.8M18 13.3c1.8.6 3 1.8 3 3.3V18" />
      </template>
      <template v-else-if="name === 'enter'">
        <path d="M14 5h5v14h-5M10 8l4 4-4 4M4 12h10" />
      </template>
      <template v-else-if="name === 'server'">
        <rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" />
        <path d="M8 7h.01M8 17h.01M16 7h1M16 17h1" />
      </template>
      <template v-else-if="name === 'share'">
        <circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" />
        <path d="M7.8 11l8.4-4.8M7.8 13l8.4 4.8" />
      </template>
      <template v-else-if="name === 'wifi'">
        <path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.2 16.2a2.8 2.8 0 0 1 3.6 0" />
        <circle cx="12" cy="19" r=".5" fill="currentColor" stroke="none" />
      </template>
      <template v-else-if="name === 'play'">
        <circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5z" />
      </template>
      <template v-else-if="name === 'eye'">
        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5z" />
        <circle cx="12" cy="12" r="2.5" />
      </template>
      <template v-else-if="name === 'chevron-left'"><path d="M15 5l-7 7 7 7" /></template>
      <template v-else-if="name === 'chevron-right'"><path d="M9 5l7 7-7 7" /></template>
      <template v-else-if="name === 'check'"><path d="M5 12.5l4.2 4.2L19 7" /></template>
      <template v-else-if="name === 'alert'">
        <path d="M12 4l9 16H3z" /><path d="M12 9v5M12 17h.01" />
      </template>
      <template v-else-if="name === 'profile'">
        <circle cx="12" cy="8" r="4" /><path d="M4.5 20c.6-4 3.1-6 7.5-6s6.9 2 7.5 6" />
      </template>
      <template v-else-if="name === 'palette'">
        <path d="M12 3a9 9 0 0 0 0 18h1.4a2 2 0 0 0 1.2-3.6 1.5 1.5 0 0 1 .9-2.7H18A3 3 0 0 0 21 12a9 9 0 0 0-9-9z" />
        <circle cx="7.5" cy="10" r=".7" fill="currentColor" /><circle cx="10" cy="6.8" r=".7" fill="currentColor" /><circle cx="14" cy="6.8" r=".7" fill="currentColor" /><circle cx="16.5" cy="10" r=".7" fill="currentColor" />
      </template>
      <template v-else-if="name === 'cards'">
        <rect x="5" y="4" width="11" height="16" rx="2" transform="rotate(-7 10.5 12)" />
        <rect x="9" y="4" width="11" height="16" rx="2" transform="rotate(7 14.5 12)" />
      </template>
      <template v-else-if="name === 'gamepad'">
        <path d="M7 8h10a4 4 0 0 1 3.8 5.2l-1.2 3.6a2.5 2.5 0 0 1-4.2 1l-1.2-1.3H9.8l-1.2 1.3a2.5 2.5 0 0 1-4.2-1l-1.2-3.6A4 4 0 0 1 7 8z" />
        <path d="M8 11v4M6 13h4M16.5 12h.01M18 14h.01" />
      </template>
      <template v-else-if="name === 'info'">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
      </template>
      <template v-else-if="name === 'back'"><path d="M19 12H5M11 6l-6 6 6 6" /></template>
      <template v-else-if="name === 'refresh'">
        <path d="M19 8V4l-2 2a8 8 0 1 0 2.2 8M19 4h-4" />
      </template>
      <template v-else-if="name === 'copy'">
        <rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </template>
      <template v-else-if="name === 'upload'">
        <path d="M12 16V4M7 9l5-5 5 5M5 15v4h14v-4" />
      </template>
      <template v-else-if="name === 'qr'">
        <rect x="3.5" y="3.5" width="6" height="6" rx="1" /><rect x="14.5" y="3.5" width="6" height="6" rx="1" />
        <rect x="3.5" y="14.5" width="6" height="6" rx="1" /><path d="M14.5 14.5h2.5v2.5h-2.5zM18 14.5h2.5M20.5 14.5V18M14.5 18v2.5H17M18.5 18.5h2v2" />
      </template>
      <template v-else-if="name === 'camera'">
        <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" />
      </template>
      <template v-else-if="name === 'image'">
        <rect x="3.5" y="4" width="17" height="16" rx="2" /><circle cx="9" cy="9" r="1.5" />
        <path d="M4 17l4.5-4 3.2 2.8 2.6-2.3L20 18" />
      </template>
    </g>
  </svg>
</template>
