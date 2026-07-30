<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AvatarBadge from '../components/AvatarBadge.vue'
import { imageFileToAvatar, type LocalProfile } from '../services/storage'
import type { GameConfig } from '../game/types'

const props = defineProps<{
  profile: LocalProfile
  busy: boolean
}>()

const emit = defineEmits<{
  createRoom: [payload: { serverAddress: string; config: Partial<GameConfig> }]
  joinRoom: [payload: { serverAddress: string; roomCode: string }]
  practice: []
  profileChange: [profile: LocalProfile]
}>()

const mode = ref<'host' | 'join'>('host')
const profileDraft = reactive({ ...props.profile })
const currentOrigin = location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')
  ? location.origin
  : ''
const serverAddress = ref(localStorage.getItem('glass-holdem.server') ?? currentOrigin)
const roomCode = ref(new URLSearchParams(location.search).get('room') ?? '')
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

function rememberServer(): string {
  const address = serverAddress.value.trim() || location.origin
  localStorage.setItem('glass-holdem.server', address)
  saveDraft()
  return address
}

function createRoom(): void {
  emit('createRoom', {
    serverAddress: rememberServer(),
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
  emit('joinRoom', {
    serverAddress: rememberServer(),
    roomCode: roomCode.value,
  })
}
</script>

<template>
  <section class="lobby-view">
    <div class="lobby-hero">
      <h1>在同一个网络，坐到同一张牌桌</h1>
      <p><AppIcon name="wifi" /> 无需注册 · 游戏数据仅在本地网络传输</p>
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
            <label class="field">
              <span>牌局名称</span>
              <input v-model="roomName" maxlength="20" autocomplete="off" />
            </label>
            <label class="field">
              <span>房主服务地址</span>
              <input v-model="serverAddress" placeholder="https://192.168.1.8:4173" inputmode="url" />
              <small>先在电脑终端运行 <code>npm run host</code></small>
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
            <AppIcon name="play" />
            {{ busy ? '正在连接…' : '连接服务并创建牌局' }}
          </button>
          <p class="form-note"><AppIcon name="server" /> 本地服务负责发牌、计时和权威状态，设备只接收自己的底牌。</p>
        </form>

        <form v-else class="lobby-form lobby-form--join" @submit.prevent="joinRoom">
          <label class="field field--wide">
            <span>房主地址</span>
            <div class="input-with-icon">
              <AppIcon name="wifi" />
              <input v-model="serverAddress" placeholder="https://192.168.1.8:4173" inputmode="url" />
            </div>
            <small>首次使用请先单独打开此地址并确认本地证书。</small>
          </label>
          <label class="field field--wide">
            <span>房间码</span>
            <input v-model="roomCode" class="room-code-input" maxlength="6" placeholder="8K2F7M" autocomplete="off" />
          </label>
          <button class="primary-action primary-action--violet" type="submit" :disabled="busy || roomCode.length < 4">
            <AppIcon name="enter" />
            {{ busy ? '正在加入…' : '加入牌局' }}
          </button>
          <p class="form-note"><AppIcon name="wifi" /> 确保所有设备连接同一个 Wi‑Fi 或热点网络。</p>
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
      <div><b>1</b><AppIcon name="server" /><span><strong>房主启动</strong><small>运行本地辅助服务</small></span></div>
      <i />
      <div><b>2</b><AppIcon name="share" /><span><strong>分享地址</strong><small>发送地址与房间码</small></span></div>
      <i />
      <div><b>3</b><AppIcon name="users" /><span><strong>玩家加入</strong><small>同一网络即可入座</small></span></div>
    </div>

    <p class="offline-note"><AppIcon name="wifi" /> 安装后可离线使用 · 牌局默认使用娱乐筹码</p>
  </section>
</template>
