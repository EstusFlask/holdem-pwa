<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AvatarBadge from '../components/AvatarBadge.vue'
import { imageFileToAvatar, type LocalProfile, type RoomSession } from '../services/storage'
import type { GameConfig } from '../game/types'

const props = defineProps<{
  profile: LocalProfile
  busy: boolean
  /** Last room this device was in, offered for a one-tap return. */
  session?: RoomSession | null
}>()

const emit = defineEmits<{
  createRoom: [payload: { config: Partial<GameConfig> }]
  joinRoom: []
  practice: []
  profileChange: [profile: LocalProfile]
  resume: []
  disconnect: []
}>()

const mode = ref<'host' | 'join'>('host')
/**
 * Direction the panel swap travels, matching the tab order on screen: join sits
 * to the right of create, so switching to it comes in from the right and back
 * to create returns from the left.
 */
const modeTransition = ref('panel-forward')
const modeTabs = ref<HTMLElement | null>(null)
const modeIndicatorX = ref(0)
const modeIndicatorWidth = ref(0)
const modeIndicatorTargetX = ref(0)
const modeIndicatorTargetWidth = ref(0)
const modeIndicatorVelocity = ref(0)
const modeIndicatorReady = ref(false)
let modeIndicatorFrame: number | null = null
let modeResizeObserver: ResizeObserver | null = null
const profileDraft = reactive({ ...props.profile })
const roomName = ref('周五牌局')
const startingStack = ref<number | null>(2000)
const smallBlind = ref(10)
const bigBlind = ref(20)
const profileSaved = computed(() =>
  profileDraft.name === props.profile.name && profileDraft.avatar === props.profile.avatar,
)
const profileNameChanged = computed(() =>
  profileDraft.name.trim() !== props.profile.name,
)

const modeIndicatorStyle = computed(() => ({
  transform: `translate3d(${modeIndicatorX.value}px, 0, 0)`,
  width: `${modeIndicatorWidth.value}px`,
}))

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function stopModeIndicatorAnimation(): void {
  if (modeIndicatorFrame !== null) {
    cancelAnimationFrame(modeIndicatorFrame)
    modeIndicatorFrame = null
  }
}

function startModeIndicatorAnimation(): void {
  if (modeIndicatorFrame !== null) return

  // The same critically damped spring used by the reference segmented control:
  // it keeps a tab switch soft without adding a distracting bounce.
  const stiffness = 360
  const damping = 2 * Math.sqrt(stiffness)
  let previousTime = performance.now()

  const tick = (now: number): void => {
    const delta = Math.min((now - previousTime) / 1000 || 0.016, 0.032)
    previousTime = now

    const acceleration = stiffness * (modeIndicatorTargetX.value - modeIndicatorX.value)
      - damping * modeIndicatorVelocity.value
    modeIndicatorVelocity.value += acceleration * delta
    modeIndicatorX.value += modeIndicatorVelocity.value * delta

    const settled = Math.abs(modeIndicatorTargetX.value - modeIndicatorX.value) < 0.1
      && Math.abs(modeIndicatorVelocity.value) < 0.1

    if (settled) {
      modeIndicatorX.value = modeIndicatorTargetX.value
      modeIndicatorWidth.value = modeIndicatorTargetWidth.value
      modeIndicatorVelocity.value = 0
      modeIndicatorFrame = null
      return
    }

    modeIndicatorFrame = requestAnimationFrame(tick)
  }

  modeIndicatorFrame = requestAnimationFrame(tick)
}

function syncModeIndicator(immediate = false): void {
  const track = modeTabs.value
  const buttons = track?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  const selectedIndex = mode.value === 'join' ? 1 : 0
  const selected = buttons?.[selectedIndex]
  if (!track || !selected) return

  const trackRect = track.getBoundingClientRect()
  const selectedRect = selected.getBoundingClientRect()
  const targetX = selectedRect.left - trackRect.left
  const targetWidth = selectedRect.width
  const targetChanged = Math.abs(modeIndicatorTargetX.value - targetX) > 0.05
    || Math.abs(modeIndicatorTargetWidth.value - targetWidth) > 0.05

  if (!immediate && modeIndicatorReady.value && !targetChanged) return

  modeIndicatorTargetX.value = targetX
  modeIndicatorTargetWidth.value = targetWidth
  if (immediate || !modeIndicatorReady.value || prefersReducedMotion()) {
    stopModeIndicatorAnimation()
    modeIndicatorX.value = targetX
    modeIndicatorWidth.value = targetWidth
    modeIndicatorVelocity.value = 0
    modeIndicatorReady.value = true
    return
  }

  startModeIndicatorAnimation()
}

function saveDraft(): void {
  const name = profileDraft.name.trim().slice(0, 16)
  if (!name) return
  emit('profileChange', { ...props.profile, name, avatar: profileDraft.avatar })
}

async function selectAvatar(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    profileDraft.avatar = await imageFileToAvatar(file)
    saveDraft()
  } finally {
    input.value = ''
  }
}

function createRoom(): void {
  saveDraft()
  const requestedStack = Number(startingStack.value)
  emit('createRoom', {
    config: {
      roomName: roomName.value.trim().slice(0, 20) || '朋友牌局',
      startingStack: Number.isFinite(requestedStack) ? Math.max(100, Math.floor(requestedStack)) : 2000,
      smallBlind: Math.max(1, Math.floor(smallBlind.value)),
      bigBlind: Math.max(Math.floor(smallBlind.value), Math.floor(bigBlind.value)),
      maxPlayers: 10,
      actionSeconds: 30,
    },
  })
}

function joinRoom(): void {
  saveDraft()
  emit('joinRoom')
}

function pickMode(next: 'host' | 'join'): void {
  if (mode.value === next) return
  modeTransition.value = next === 'join' ? 'panel-forward' : 'panel-back'
  mode.value = next
}

watch(mode, () => {
  nextTick(() => syncModeIndicator())
})

onMounted(() => {
  nextTick(() => {
    syncModeIndicator(true)
    if (modeTabs.value && typeof ResizeObserver !== 'undefined') {
      modeResizeObserver = new ResizeObserver(() => syncModeIndicator(true))
      modeResizeObserver.observe(modeTabs.value)
    }
  })
})

onBeforeUnmount(() => {
  stopModeIndicatorAnimation()
  modeResizeObserver?.disconnect()
})
</script>

<template>
  <section class="lobby-view">
    <div class="lobby-hero">
      <h1>本网站完全免费开源，禁止用于赌博！</h1>
      <p><AppIcon name="wifi" /> 安装后可完全离线联机 | 需要同时连接一个本地Wi-Fi或热点进行联机</p>
    </div>

    <!-- Shown after an unexpected exit: the room this device was last in, with a
         way back and a way to forget it if it has gone stale. -->
    <div v-if="session" class="resume-banner lggc">
      <span class="resume-banner__mark"><AppIcon name="refresh" /></span>
      <div class="resume-banner__copy">
        <strong>继续上次的牌局</strong>
        <small>
          {{ session.role === 'host' ? '你是房主' : '你是玩家' }} ·
          {{ session.roomName }}<template v-if="session.roomCode"> · #{{ session.roomCode }}</template>
        </small>
      </div>
      <button class="primary-action primary-action--green" type="button" :disabled="busy" @click="$emit('resume')">
        <AppIcon :name="session.role === 'host' ? 'qr' : 'camera'" />
        {{ session.role === 'host' ? '重建牌局' : '重新连接' }}
      </button>
      <button class="resume-banner__drop" type="button" title="断开连接并清除" @click="$emit('disconnect')">
        <AppIcon name="unlink" /> 断开连接
      </button>
    </div>

    <div class="lobby-layout">
      <div class="lobby-console lggc">
        <div ref="modeTabs" class="mode-tabs" role="tablist" aria-label="联机模式">
          <span
            class="mode-tabs__indicator"
            :class="{ 'is-ready': modeIndicatorReady }"
            :style="modeIndicatorStyle"
            aria-hidden="true"
          />
          <button
            class="mode-tab pressable"
            type="button"
            role="tab"
            :aria-selected="mode === 'host'"
            :class="{ active: mode === 'host' }"
            @click="pickMode('host')"
          >
            <AppIcon name="users" /> 创建牌局
          </button>
          <button
            class="mode-tab pressable"
            type="button"
            role="tab"
            :aria-selected="mode === 'join'"
            :class="{ active: mode === 'join' }"
            @click="pickMode('join')"
          >
            <AppIcon name="enter" /> 加入牌局
          </button>
        </div>

        <!-- Create and join swap in the direction their tabs sit in. -->
        <Transition :name="modeTransition">
          <form v-if="mode === 'host'" key="host" class="lobby-form" @submit.prevent="createRoom">
            <div class="form-grid">
              <label class="field field--wide">
                <span>牌局名称</span>
                <input class="liquid-input" v-model="roomName" maxlength="20" autocomplete="off" />
              </label>
              <label class="field">
                <span>起始筹码</span>
                <input
                  class="liquid-input"
                  v-model.number="startingStack"
                  type="number"
                  min="100"
                  step="1"
                  inputmode="numeric"
                />
              </label>
              <div class="field">
                <span>小盲 / 大盲</span>
                <div class="split-input">
                  <input class="liquid-input" v-model.number="smallBlind" type="number" min="1" inputmode="numeric" />
                  <b>/</b>
                  <input class="liquid-input" v-model.number="bigBlind" type="number" min="2" inputmode="numeric" />
                </div>
              </div>
            </div>
            <button class="glass-button glass-button--quiet lobby-submit pressable" type="submit" :disabled="busy">
              {{ busy ? '正在生成邀请…' : '创建离线牌局' }}
            </button>
          </form>

          <form v-else key="join" class="lobby-form lobby-form--join" @submit.prevent="joinRoom">
            <div class="join-pairing-visual" aria-hidden="true">
              <span><AppIcon name="qr" /></span>
              <i><AppIcon name="share" /></i>
              <span><AppIcon name="camera" /></span>
            </div>
            <div class="join-pairing-copy">
              <strong>和房主完成一次双向扫码</strong>
              <p>先扫描房主邀请，再让房主扫描你的应答。配对完成后自动入座。</p>
            </div>
            <button class="glass-button glass-button--quiet lobby-submit pressable" type="submit" :disabled="busy">
              {{ busy ? '正在准备配对…' : '开始配对' }}
            </button>
          </form>
        </Transition>
      </div>

      <aside class="profile-panel lggc">
        <div class="panel-title">
          <span>我的资料</span>
          <span class="saved-state"><i />{{ profileSaved ? '本机资料已保存' : '待保存' }}</span>
        </div>
        <div class="profile-editor">
          <label class="avatar-uploader">
            <AvatarBadge :name="profileDraft.name || 'P'" :src="profileDraft.avatar" size="large" />
            <span><AppIcon name="upload" /></span>
            <input type="file" accept="image/png,image/jpeg,image/webp" @change="selectAvatar" />
          </label>
          <div class="profile-name-editor">
            <div class="field profile-name-field">
              <span>你的名字</span>
              <div class="profile-name-input-wrap">
                <input class="liquid-input" v-model="profileDraft.name" maxlength="16" aria-label="你的名字" />
                <button
                  v-if="profileNameChanged"
                  class="glass-button circle-button profile-save-button"
                  type="button"
                  :disabled="!profileDraft.name.trim()"
                  aria-label="保存用户名"
                  title="保存用户名"
                  @click="saveDraft"
                >
                  <AppIcon name="check" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <p>头像与名字只保存在当前浏览器中，加入牌局时发送给房主。</p>
        <div class="profile-divider" />
        <button class="practice-button" type="button" @click="$emit('practice')">
          <AppIcon name="gamepad" />
          <span><strong>离线练习</strong><small>无需服务，和 3 名本地玩家练手</small></span>
          <AppIcon name="chevron-right" />
        </button>
      </aside>
    </div>

  </section>
</template>
