<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import type { PairingStage } from './components/PairingPanel.vue'
import LobbyView from './views/LobbyView.vue'
import RulesView from './views/RulesView.vue'
import SettingsView from './views/SettingsView.vue'
import TableView from './views/TableView.vue'
import { applyAction, createGame, legalActions, startHand } from './game/engine'
import { browserCryptoRandomInt } from './game/random'
import type { GameConfig, GameState, LegalActions, PlayerAction, PlayerProfile } from './game/types'
import {
  GuestPeerRoom,
  HostPeerRoom,
  legalWhenWaiting,
  type PeerRoomMessage,
  type PeerStateMessage,
} from './services/webrtc'
import {
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type LocalProfile,
  type LocalSettings,
} from './services/storage'

type ViewName = 'lobby' | 'table' | 'settings' | 'rules'

const PairingPanel = defineAsyncComponent(() => import('./components/PairingPanel.vue'))
const view = ref<ViewName>('lobby')
const previousView = ref<ViewName>('lobby')
const profile = reactive<LocalProfile>(loadProfile())
const settings = reactive<LocalSettings>(loadSettings())
const game = ref<GameState | null>(null)
const legal = ref<LegalActions>(emptyLegal())
const selfId = ref(profile.id)
const isHost = ref(false)
const isLocalPractice = ref(false)
const connected = ref(false)
const busy = ref(false)
const toast = ref('')
let toastTimer = 0
let botTimer = 0
let peerRoom: HostPeerRoom | GuestPeerRoom | null = null
let removePeerListener: (() => void) | null = null

const pairing = reactive<{
  open: boolean
  role: 'host' | 'guest'
  stage: PairingStage
  code: string
  status: string
  error: string
  roomName: string
  roomCode: string
  peerCount: number
}>({
  open: false,
  role: 'host',
  stage: 'preparing',
  code: '',
  status: '',
  error: '',
  roomName: '',
  roomCode: '',
  peerCount: 0,
})

const tableSubtitle = computed(() => {
  if (!game.value) return ''
  return `${game.value.config.roomName} · #${game.value.roomCode}`
})

function handlePeerMessage(message: PeerRoomMessage): void {
  if (message.type === 'error') {
    showToast(message.message)
    pairing.error = message.message
    if (pairing.open && (pairing.stage === 'connecting' || pairing.stage === 'preparing' || pairing.stage === 'guest-answer')) {
      pairing.stage = 'failed'
    }
    busy.value = false
    return
  }
  if (message.type === 'state') {
    const stateMessage = message as PeerStateMessage
    game.value = stateMessage.state
    legal.value = stateMessage.legal
    selfId.value = stateMessage.selfId
    isHost.value = stateMessage.isHost
    connected.value = true
    busy.value = false
    view.value = 'table'
    if (!stateMessage.isHost) pairing.open = false
    return
  }
  pairing.peerCount = message.peerCount
  if (message.status === 'connected' && pairing.role === 'host' && message.playerName) {
    pairing.stage = 'connected'
    pairing.status = `${message.playerName} 已安全入座`
  } else if (
    pairing.role === 'guest'
    && (message.status === 'failed' || message.status === 'closed')
  ) {
    pairing.error = '点对点连接中断，请确认两台设备在同一 Wi-Fi 或热点后重新配对'
    if (pairing.open && pairing.stage !== 'connected') pairing.stage = 'failed'
    busy.value = false
  }
}

function emptyLegal(): LegalActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    canRaise: false,
    toCall: 0,
    minRaiseTo: 0,
    maxRaiseTo: 0,
  }
}

function showToast(message: string): void {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.value = '' }, 3600)
}

function bindPeerRoom(room: HostPeerRoom | GuestPeerRoom): void {
  removePeerListener?.()
  peerRoom?.close()
  peerRoom = room
  removePeerListener = room.onMessage(handlePeerMessage)
}

async function createPeerRoom(payload: { config: Partial<GameConfig> }): Promise<void> {
  try {
    busy.value = true
    saveProfile(profile)
    const room = new HostPeerRoom({ ...profile }, payload.config)
    bindPeerRoom(room)
    isHost.value = true
    isLocalPractice.value = false
    connected.value = true
    view.value = 'table'
    pairing.roomName = payload.config.roomName ?? '朋友牌局'
    pairing.roomCode = room.roomCode
    await generateHostInvite()
  } catch (error) {
    busy.value = false
    showToast(error instanceof Error ? error.message : '无法创建牌局')
  }
}

function joinPeerRoom(): void {
  busy.value = true
  saveProfile(profile)
  const room = new GuestPeerRoom({ ...profile })
  bindPeerRoom(room)
  game.value = null
  legal.value = legalWhenWaiting()
  isHost.value = false
  isLocalPractice.value = false
  connected.value = false
  Object.assign(pairing, {
    open: true,
    role: 'guest',
    stage: 'guest-scan',
    code: '',
    status: '扫描房主设备上的邀请二维码',
    error: '',
    roomName: '',
    roomCode: '',
    peerCount: 0,
  })
}

async function generateHostInvite(): Promise<void> {
  if (!(peerRoom instanceof HostPeerRoom)) return
  Object.assign(pairing, {
    open: true,
    role: 'host',
    stage: 'preparing',
    code: '',
    status: '正在收集当前设备的局域网连接信息…',
    error: '',
    peerCount: peerRoom.peerCount,
  })
  try {
    pairing.code = await peerRoom.createInvite()
    pairing.stage = 'host-offer'
    pairing.status = '等待玩家扫描邀请'
    busy.value = false
  } catch (error) {
    busy.value = false
    pairing.error = error instanceof Error ? error.message : '无法生成邀请'
    pairing.stage = 'failed'
  }
}

async function handlePairingCode(code: string): Promise<void> {
  pairing.error = ''
  if (pairing.role === 'host') {
    if (!(peerRoom instanceof HostPeerRoom)) return
    pairing.stage = 'connecting'
    pairing.status = '已读取应答，正在建立直连…'
    try {
      const playerName = await peerRoom.acceptAnswer(code)
      pairing.stage = 'connected'
      pairing.status = `${playerName} 已安全入座`
    } catch (error) {
      pairing.stage = 'failed'
      pairing.error = error instanceof Error ? error.message : '无法建立点对点连接'
      busy.value = false
    }
    return
  }

  if (!(peerRoom instanceof GuestPeerRoom)) return
  pairing.stage = 'preparing'
  pairing.status = '正在生成只属于本次连接的应答…'
  try {
    const result = await peerRoom.acceptOffer(code)
    pairing.code = result.answer
    pairing.roomName = result.room.name
    pairing.roomCode = result.room.code
    pairing.stage = 'guest-answer'
    pairing.status = '等待房主扫描此应答二维码'
  } catch (error) {
    pairing.stage = 'guest-scan'
    pairing.error = error instanceof Error ? error.message : '无法读取房主邀请'
  }
}

function retryGuestPairing(): void {
  peerRoom?.close()
  game.value = null
  connected.value = false
  Object.assign(pairing, {
    stage: 'guest-scan',
    code: '',
    status: '扫描房主设备上的新邀请二维码',
    error: '',
    roomName: '',
    roomCode: '',
    peerCount: 0,
  })
}

function closePairing(): void {
  pairing.open = false
  if (pairing.role === 'guest' && !game.value) {
    removePeerListener?.()
    removePeerListener = null
    peerRoom?.close()
    peerRoom = null
    busy.value = false
  }
}

function startPractice(): void {
  saveProfile(profile)
  isLocalPractice.value = true
  isHost.value = true
  connected.value = false
  const players: PlayerProfile[] = [
    { ...profile },
    { id: 'bot-mika', name: 'Mika', avatar: '' },
    { id: 'bot-lin', name: 'Lin', avatar: '' },
    { id: 'bot-rui', name: 'Rui', avatar: '' },
  ]
  game.value = createGame('OFFLINE', players, {
    roomName: '离线练习',
    startingStack: 2000,
    smallBlind: 10,
    bigBlind: 20,
    actionSeconds: 30,
  })
  selfId.value = profile.id
  startPracticeHand()
  view.value = 'table'
}

function startPracticeHand(): void {
  if (!game.value) return
  try {
    startHand(game.value, browserCryptoRandomInt)
    refreshPracticeState()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '无法开始手牌')
  }
}

function refreshPracticeState(): void {
  if (!game.value) return
  legal.value = legalActions(game.value, selfId.value)
  game.value = { ...game.value }
  window.clearTimeout(botTimer)
  const actor = game.value.players[game.value.actorIndex]
  if (actor && actor.id !== selfId.value) {
    botTimer = window.setTimeout(playBotTurn, 560)
  }
}

function playBotTurn(): void {
  if (!game.value) return
  const actor = game.value.players[game.value.actorIndex]
  if (!actor || actor.id === selfId.value) return
  const options = legalActions(game.value, actor.id)
  const roll = browserCryptoRandomInt(100)
  let action: PlayerAction
  let amount: number | undefined

  if (options.canCheck && roll < 82) action = 'check'
  else if (options.canCall && roll < 74) action = 'call'
  else if (options.canRaise && roll > 88) {
    action = 'raise'
    const span = Math.max(0, options.maxRaiseTo - options.minRaiseTo)
    amount = options.minRaiseTo + (span ? browserCryptoRandomInt(Math.min(span, game.value.config.bigBlind * 6) + 1) : 0)
  } else action = options.canCheck ? 'check' : options.canCall && roll < 88 ? 'call' : 'fold'

  applyAction(game.value, actor.id, action, amount)
  refreshPracticeState()
}

function startNextHand(): void {
  if (isLocalPractice.value) startPracticeHand()
  else if (peerRoom instanceof HostPeerRoom) peerRoom.startHand()
}

function act(payload: { action: PlayerAction; raiseTo?: number }): void {
  try {
    if (isLocalPractice.value && game.value) {
      applyAction(game.value, selfId.value, payload.action, payload.raiseTo)
      refreshPracticeState()
    } else if (peerRoom instanceof HostPeerRoom) {
      peerRoom.action(payload.action, payload.raiseTo)
    } else if (peerRoom instanceof GuestPeerRoom) {
      peerRoom.action(payload.action, payload.raiseTo)
    } else {
      throw new Error('尚未建立点对点连接')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
}

function openView(target: 'settings' | 'rules'): void {
  previousView.value = view.value
  view.value = target
}

function goBack(): void {
  view.value = game.value ? 'table' : previousView.value === 'table' ? 'lobby' : previousView.value
}

function updateProfile(nextProfile: LocalProfile): void {
  Object.assign(profile, nextProfile)
  saveProfile(profile)
  showToast('个人资料已保存在本机')
}

function updateSettings(nextSettings: LocalSettings): void {
  Object.assign(settings, nextSettings)
  saveSettings(settings)
  document.documentElement.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false'
  showToast('设置已保存')
}

function leaveTable(): void {
  removePeerListener?.()
  removePeerListener = null
  peerRoom?.close()
  peerRoom = null
  window.clearTimeout(botTimer)
  game.value = null
  connected.value = false
  isLocalPractice.value = false
  pairing.open = false
  view.value = 'lobby'
}

onBeforeUnmount(() => {
  removePeerListener?.()
  peerRoom?.close()
  window.clearTimeout(botTimer)
  window.clearTimeout(toastTimer)
})

nextTick(() => {
  document.documentElement.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false'
})
</script>

<template>
  <div class="app-shell">
    <AppHeader
      v-if="view === 'lobby' || view === 'table'"
      :compact="view === 'table'"
      :subtitle="tableSubtitle"
      :connected="connected || isLocalPractice"
      @rules="openView('rules')"
      @settings="openView('settings')"
      @leave="leaveTable"
    />

    <main class="app-main">
      <LobbyView
        v-if="view === 'lobby'"
        :profile="profile"
        :busy="busy"
        @create-room="createPeerRoom"
        @join-room="joinPeerRoom"
        @practice="startPractice"
        @profile-change="updateProfile"
      />
      <TableView
        v-else-if="view === 'table' && game"
        :game="game"
        :legal="legal"
        :self-id="selfId"
        :is-host="isHost"
        :is-local-practice="isLocalPractice"
        :settings="settings"
        @action="act"
        @start-hand="startNextHand"
        @invite="generateHostInvite"
      />
      <SettingsView
        v-else-if="view === 'settings'"
        :profile="profile"
        :settings="settings"
        @back="goBack"
        @profile-change="updateProfile"
        @save="updateSettings"
      />
      <RulesView v-else-if="view === 'rules'" @back="goBack" />
    </main>

    <Transition name="toast">
      <div v-if="toast" class="toast lggc" role="status">{{ toast }}</div>
    </Transition>

    <PairingPanel
      v-if="pairing.open"
      :open="pairing.open"
      :role="pairing.role"
      :stage="pairing.stage"
      :code="pairing.code"
      :status="pairing.status"
      :error="pairing.error"
      :room-name="pairing.roomName"
      :room-code="pairing.roomCode"
      :peer-count="pairing.peerCount"
      @close="closePairing"
      @scan="handlePairingCode"
      @scan-answer="pairing.stage = 'host-scan'"
      @new-invite="generateHostInvite"
      @retry-guest="retryGuestPairing"
    />
  </div>
</template>
