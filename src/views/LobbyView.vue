<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
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
const profileDraft = reactive({ ...props.profile })
const roomName = ref('周五牌局')
const startingStack = ref(2000)
const smallBlind = ref(10)
const bigBlind = ref(20)
const profileSaved = computed(() =>
  profileDraft.name === props.profile.name && profileDraft.avatar === props.profile.avatar,
)

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
  emit('createRoom', {
    config: {
      roomName: roomName.value.trim().slice(0, 20) || '朋友牌局',
      startingStack: Math.max(100, Math.floor(startingStack.value)),
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
        <div class="mode-tabs" role="tablist" aria-label="联机模式">
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'host'"
            :class="{ active: mode === 'host' }"
            @click="mode = 'host'"
          >
            <AppIcon name="users" /> 创建牌局
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'join'"
            :class="{ active: mode === 'join' }"
            @click="mode = 'join'"
          >
            <AppIcon name="enter" /> 加入牌局
          </button>
        </div>

        <form v-if="mode === 'host'" class="lobby-form" @submit.prevent="createRoom">
          <div class="form-grid">
            <label class="field field--wide">
              <span>牌局名称</span>
              <input v-model="roomName" maxlength="20" autocomplete="off" />
            </label>
            <label class="field">
              <span>起始筹码</span>
              <select v-model.number="startingStack">
                <option :value="1000">1,000</option>
                <option :value="2000">2,000</option>
                <option :value="5000">5,000</option>
                <option :value="10000">10,000</option>
              </select>
            </label>
            <div class="field">
              <span>小盲 / 大盲</span>
              <div class="split-input">
                <input v-model.number="smallBlind" type="number" min="1" inputmode="numeric" />
                <b>/</b>
                <input v-model.number="bigBlind" type="number" min="2" inputmode="numeric" />
              </div>
            </div>
          </div>
          <button class="primary-action primary-action--green" type="submit" :disabled="busy">
            <AppIcon name="qr" />
            {{ busy ? '正在生成邀请…' : '创建离线牌局' }}
          </button>
          <p class="form-note"><AppIcon name="info" /> 房主 PWA 负责发牌、计时和权威状态；关闭房主页面会结束联机。</p>
        </form>

        <form v-else class="lobby-form lobby-form--join" @submit.prevent="joinRoom">
          <div class="join-pairing-visual" aria-hidden="true">
            <span><AppIcon name="qr" /></span>
            <i><AppIcon name="share" /></i>
            <span><AppIcon name="camera" /></span>
          </div>
          <div class="join-pairing-copy">
            <strong>和房主完成一次双向扫码</strong>
            <p>先扫描房主邀请，再让房主扫描你的应答。配对完成后自动入座。</p>
          </div>
          <button class="primary-action primary-action--violet" type="submit" :disabled="busy">
            <AppIcon name="camera" />
            {{ busy ? '正在准备扫码…' : '开始扫码配对' }}
          </button>
          <p class="form-note"><AppIcon name="wifi" /> 两台设备需连接同一个 Wi‑Fi 或热点；不需要互联网。</p>
        </form>
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
          <label class="field">
            <span>你的名字</span>
            <input v-model="profileDraft.name" maxlength="16" @change="saveDraft" />
          </label>
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

    <div class="connection-steps lggc" aria-label="本地联机步骤">
      <div><b>1</b><AppIcon name="play" /><span><strong>房主建桌</strong><small>直接在 PWA 创建牌局</small></span></div>
      <p />
      <div><b>2</b><AppIcon name="qr" /><span><strong>双向扫码</strong><small>交换邀请与应答二维码</small></span></div>
      <p />
      <div><b>3</b><AppIcon name="users" /><span><strong>直接开局</strong><small>点对点连接后自动入座</small></span></div>
    </div>

  </section>
</template>
