<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import LobbyView from './views/LobbyView.vue'
import RulesView from './views/RulesView.vue'
import SettingsView from './views/SettingsView.vue'
import TableView from './views/TableView.vue'
import { applyAction, createGame, legalActions, startHand } from './game/engine'
import { browserCryptoRandomInt } from './game/random'
import type { GameConfig, GameState, LegalActions, PlayerAction, PlayerProfile } from './game/types'
import { RoomSocket, type ServerStateMessage } from './services/socket'
import {
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type LocalProfile,
  type LocalSettings,
} from './services/storage'

type ViewName = 'lobby' | 'table' | 'settings' | 'rules'

const view = ref<ViewName>('lobby')
const previousView = ref<ViewName>('lobby')
const profile = reactive<LocalProfile>(loadProfile())
const settings = reactive<LocalSettings>(loadSettings())
const socket = new RoomSocket()
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

const tableSubtitle = computed(() => {
  if (!game.value) return ''
  return `${game.value.config.roomName} · #${game.value.roomCode}`
})

socket.onMessage((message) => {
  if (message.type === 'error') {
    showToast('message' in message ? message.message : '服务返回错误')
    busy.value = false
    return
  }
  if (message.type === 'state') {
    const stateMessage = message as ServerStateMessage
    game.value = stateMessage.state
    legal.value = stateMessage.legal
    selfId.value = stateMessage.selfId
    isHost.value = stateMessage.isHost
    connected.value = true
    busy.value = false
    view.value = 'table'
  }
})

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

async function connectAndCreate(payload: {
  serverAddress: string
  config: Partial<GameConfig>
}): Promise<void> {
  try {
    busy.value = true
    saveProfile(profile)
    await socket.connect(payload.serverAddress)
    socket.createRoom({ ...profile }, payload.config)
  } catch (error) {
    busy.value = false
    showToast(error instanceof Error ? error.message : '连接失败')
  }
}

async function connectAndJoin(payload: { serverAddress: string; roomCode: string }): Promise<void> {
  try {
    busy.value = true
    saveProfile(profile)
    await socket.connect(payload.serverAddress)
    socket.joinRoom({ ...profile }, payload.roomCode.trim().toUpperCase())
  } catch (error) {
    busy.value = false
    showToast(error instanceof Error ? error.message : '连接失败')
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
  else socket.startHand()
}

function act(payload: { action: PlayerAction; raiseTo?: number }): void {
  try {
    if (isLocalPractice.value && game.value) {
      applyAction(game.value, selfId.value, payload.action, payload.raiseTo)
      refreshPracticeState()
    } else {
      socket.action(payload.action, payload.raiseTo)
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
  socket.close()
  window.clearTimeout(botTimer)
  game.value = null
  connected.value = false
  isLocalPractice.value = false
  view.value = 'lobby'
}

onBeforeUnmount(() => {
  socket.close()
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
        @create-room="connectAndCreate"
        @join-room="connectAndJoin"
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
  </div>
</template>
