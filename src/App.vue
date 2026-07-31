<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import AppIcon from './components/AppIcon.vue'
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
  clearRoomSession,
  loadProfile,
  loadRoomSession,
  loadSettings,
  saveProfile,
  saveRoomSession,
  saveSettings,
  type LocalProfile,
  type LocalSettings,
  type RoomSession,
} from './services/storage'
import { applyColorMode, watchSystemColorMode } from './services/theme'

type ViewName = 'lobby' | 'table' | 'settings' | 'rules'

/**
 * How deep each view sits, so a switch knows which way it is travelling and can
 * enter and exit along the same path — a screen that arrives from the right
 * leaves back to the right, which is what makes the stack feel like a place
 * rather than a slideshow.
 */
const VIEW_DEPTH: Record<ViewName, number> = { lobby: 0, table: 1, settings: 2, rules: 2 }

const PairingPanel = defineAsyncComponent(() => import('./components/PairingPanel.vue'))
const view = ref<ViewName>('lobby')
const previousView = ref<ViewName>('lobby')
/** Transition to play for the pending view switch. */
const viewTransition = ref('view-forward')
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
/** Saved room offered for one-tap return after an accidental tab close. */
const resumable = ref<RoomSession | null>(loadRoomSession())
/** Leave is destructive and one mis-tap away, so it always asks first. */
const leaveConfirm = ref(false)
let toastTimer = 0
let botTimer = 0
let peerRoom: HostPeerRoom | GuestPeerRoom | null = null
let removePeerListener: (() => void) | null = null
let stopSystemThemeWatch: (() => void) | null = null
/** Config the host is running, kept so the room can be rebuilt as it was. */
let hostConfig: Partial<GameConfig> | null = null

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
    goTo('table')
    if (!stateMessage.isHost) {
      pairing.open = false
      // A guest that reaches state is properly seated, so this is the moment
      // the room is worth remembering: the host matches our profile id back to
      // this seat and stack if we ever have to pair again.
      rememberSession('guest', stateMessage.state.config.roomName, stateMessage.state.roomCode)
    }
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

function rememberSession(role: 'host' | 'guest', roomName: string, roomCode: string): void {
  const config = role === 'host' && hostConfig
    ? {
        roomName: hostConfig.roomName ?? roomName,
        startingStack: hostConfig.startingStack ?? 2000,
        smallBlind: hostConfig.smallBlind ?? 10,
        bigBlind: hostConfig.bigBlind ?? 20,
      }
    : undefined
  saveRoomSession({ role, roomName, roomCode, config })
  resumable.value = loadRoomSession()
}

function forgetSession(): void {
  clearRoomSession()
  resumable.value = null
}

/**
 * Returns to a remembered room. Pairing codes are single-use and there is no
 * signalling server, so this cannot silently restore a live connection — what it
 * does is skip the lobby: a guest goes straight to scanning, and a host rebuilds
 * the table on its old settings and reopens the invite.
 */
function resumeSession(): void {
  const session = resumable.value
  if (!session) return
  if (session.role === 'guest') {
    joinPeerRoom()
    showToast(`正在重新连接「${session.roomName}」，请扫描房主的新邀请`)
    return
  }
  void createPeerRoom({ config: session.config ?? { roomName: session.roomName } })
  showToast('已按上次的设置重建牌局，请重新邀请玩家')
}

function disconnectSession(): void {
  teardownRoom()
  forgetSession()
  game.value = null
  connected.value = false
  isLocalPractice.value = false
  pairing.open = false
  leaveConfirm.value = false
  goTo('lobby')
  showToast('已断开连接并清除保存的房间')
}

async function createPeerRoom(payload: { config: Partial<GameConfig> }): Promise<void> {
  try {
    busy.value = true
    saveProfile(profile)
    const room = new HostPeerRoom({ ...profile }, payload.config)
    bindPeerRoom(room)
    hostConfig = payload.config
    isHost.value = true
    isLocalPractice.value = false
    connected.value = true
    goTo('table')
    pairing.roomName = payload.config.roomName ?? '朋友牌局'
    pairing.roomCode = room.roomCode
    rememberSession('host', pairing.roomName, room.roomCode)
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
  goTo('table')
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
    // Long enough for the acting bot's callout to read before the next one
    // starts, so practice paces like a networked table rather than a fast-forward.
    botTimer = window.setTimeout(playBotTurn, 900)
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

/**
 * Deals the next hand. The table calls this itself once a settlement has
 * finished playing, so a friendly game keeps moving without anyone hunting for
 * a "deal" button; it stays a no-op for guests, who have no authority to deal.
 */
function startNextHand(): void {
  if (isLocalPractice.value) startPracticeHand()
  else if (peerRoom instanceof HostPeerRoom) {
    try {
      peerRoom.startHand()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法开始手牌')
    }
  }
}

/**
 * Rebuys everyone to the starting stack and deals. Only reachable when the table
 * can no longer continue on its own — one player holding every chip.
 */
function restartGame(): void {
  if (isLocalPractice.value && game.value) {
    for (const player of game.value.players) player.stack = game.value.config.startingStack
    startPracticeHand()
    return
  }
  if (peerRoom instanceof HostPeerRoom) {
    try {
      peerRoom.restart()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法重新开始牌局')
    }
  }
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

/**
 * Switches view and picks the motion for it.
 *
 * The table is not a sibling of the lobby — it is the thing the app is for — so
 * arriving there materialises the felt rather than sliding a page in, and
 * leaving it recedes back the way it came. Everything else is a stack: deeper
 * comes in from the right, shallower goes back out to the right.
 */
function goTo(target: ViewName): void {
  if (view.value === target) return
  const from = VIEW_DEPTH[view.value]
  const to = VIEW_DEPTH[target]
  viewTransition.value = target === 'table'
    ? 'view-immerse'
    : view.value === 'table' && to < from
      ? 'view-recede'
      : to >= from
        ? 'view-forward'
        : 'view-back'
  view.value = target
}

function openView(target: 'settings' | 'rules'): void {
  previousView.value = view.value
  goTo(target)
}

function goBack(): void {
  goTo(game.value ? 'table' : previousView.value === 'table' ? 'lobby' : previousView.value)
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
  applyColorMode(settings.colorMode)
  showToast('设置已保存')
}

function teardownRoom(): void {
  removePeerListener?.()
  removePeerListener = null
  peerRoom?.close()
  peerRoom = null
  hostConfig = null
  window.clearTimeout(botTimer)
}

/** Asks first: leaving mid-hand costs the table a player and cannot be undone. */
function requestLeave(): void {
  if (isLocalPractice.value) {
    leaveTable()
    return
  }
  leaveConfirm.value = true
}

/**
 * Leaves the table but keeps the saved room, so an accidental exit can be
 * answered with one tap from the lobby instead of a fresh setup.
 */
function leaveTable(): void {
  const practice = isLocalPractice.value
  teardownRoom()
  game.value = null
  connected.value = false
  isLocalPractice.value = false
  pairing.open = false
  leaveConfirm.value = false
  goTo('lobby')
  if (practice) forgetSession()
  else resumable.value = loadRoomSession()
}

/**
 * A closing tab takes the peer connection with it — and for a host, the whole
 * authoritative table. The browser will only show its own generic prompt, but
 * that is enough to catch a mis-clicked close.
 */
function guardUnload(event: BeforeUnloadEvent): void {
  if (!connected.value || isLocalPractice.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeUnmount(() => {
  teardownRoom()
  stopSystemThemeWatch?.()
  window.removeEventListener('beforeunload', guardUnload)
  window.clearTimeout(toastTimer)
})

applyColorMode(settings.colorMode)
stopSystemThemeWatch = watchSystemColorMode()
window.addEventListener('beforeunload', guardUnload)

nextTick(() => {
  document.documentElement.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false'
})
</script>

<template>
  <div class="app-shell">
    <!-- The table is full-bleed: it carries its own compact icon rail instead. -->
    <Transition name="view-header">
      <AppHeader
        v-if="view === 'lobby'"
        :connected="connected || isLocalPractice"
        @rules="openView('rules')"
        @settings="openView('settings')"
        @leave="leaveTable"
      />
    </Transition>

    <!-- One view at a time, so the arriving screen never overlaps the leaving
         one; `viewTransition` carries the direction the switch is travelling. -->
    <main class="app-main">
      <Transition :name="viewTransition" mode="out-in">
        <LobbyView
          v-if="view === 'lobby'"
          :profile="profile"
          :busy="busy"
          :session="resumable"
          @create-room="createPeerRoom"
          @join-room="joinPeerRoom"
          @practice="startPractice"
          @profile-change="updateProfile"
          @resume="resumeSession"
          @disconnect="disconnectSession"
        />
        <TableView
          v-else-if="view === 'table' && game"
          :game="game"
          :legal="legal"
          :self-id="selfId"
          :is-host="isHost"
          :is-local-practice="isLocalPractice"
          :settings="settings"
          :connected="connected || isLocalPractice"
          @action="act"
          @start-hand="startNextHand"
          @restart="restartGame"
          @invite="generateHostInvite"
          @rules="openView('rules')"
          @settings-open="openView('settings')"
          @leave="requestLeave"
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
      </Transition>
    </main>

    <Transition name="toast">
      <div v-if="toast" class="toast lggc" role="status">{{ toast }}</div>
    </Transition>

    <!-- Only the buttons dismiss this: a tap on the scrim is exactly the kind of
         mis-touch the confirmation exists to catch. -->
    <Transition name="pairing">
      <div v-if="leaveConfirm" class="confirm-scrim">
        <section class="confirm-sheet lggc" role="dialog" aria-modal="true" aria-labelledby="leave-title">
          <h2 id="leave-title">确认离开牌桌？</h2>
          <p v-if="isHost">你是房主，离开会结束这场牌局，其他玩家会断开连接。</p>
          <p v-else>离开后可以在首页一键重新连接，你的座位和筹码会由房主保留。</p>
          <div class="confirm-actions">
            <button class="glass-button" type="button" @click="leaveConfirm = false">继续牌局</button>
            <button class="primary-action primary-action--violet" type="button" @click="leaveTable">
              <AppIcon name="leave" /> 确认离开
            </button>
          </div>
          <button class="confirm-disconnect" type="button" @click="disconnectSession">
            <AppIcon name="unlink" /> 离开并清除保存的房间
          </button>
        </section>
      </div>
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
