import { deflate, inflate } from 'pako'
import { addPlayer, applyAction, createGame, legalActions, publicStateFor, startHand } from '../game/engine'
import { browserCryptoRandomInt } from '../game/random'
import type { GameConfig, GameState, LegalActions, PlayerAction, PlayerProfile } from '../game/types'

const SIGNAL_PREFIX = 'GH1.'
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const RTC_CONFIGURATION: RTCConfiguration = { iceServers: [] }

export interface PeerStateMessage {
  type: 'state'
  state: GameState
  legal: LegalActions
  selfId: string
  isHost: boolean
}

export interface PeerErrorMessage {
  type: 'error'
  message: string
}

export interface PeerStatusMessage {
  type: 'status'
  status: RTCPeerConnectionState | 'waiting'
  peerCount: number
  playerName?: string
}

export type PeerRoomMessage = PeerStateMessage | PeerErrorMessage | PeerStatusMessage
type Listener = (message: PeerRoomMessage) => void

interface RoomSummary {
  code: string
  name: string
  host: string
}

export interface PairingSignal {
  version: 1
  type: 'offer' | 'answer'
  sessionId: string
  description: RTCSessionDescriptionInit
  room?: RoomSummary
}

interface ClientMessage {
  type: 'join' | 'action' | 'ping'
  profile?: PlayerProfile
  action?: PlayerAction
  raiseTo?: number
}

interface HostSession {
  connection: RTCPeerConnection
  channel: RTCDataChannel
  playerId?: string
  playerName?: string
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function encodePairingSignal(signal: PairingSignal): string {
  const compressed = deflate(JSON.stringify(signal), { level: 9 })
  return `${SIGNAL_PREFIX}${bytesToBase64Url(compressed)}`
}

export function decodePairingSignal(code: string): PairingSignal {
  const normalized = code.trim().replace(/\s+/g, '')
  if (!normalized.startsWith(SIGNAL_PREFIX)) throw new Error('这不是 Glass Hold’em 配对码')

  let signal: unknown
  try {
    signal = JSON.parse(inflate(base64UrlToBytes(normalized.slice(SIGNAL_PREFIX.length)), { toText: true }))
  } catch {
    throw new Error('配对码损坏或不完整')
  }
  if (
    !signal
    || typeof signal !== 'object'
    || (signal as PairingSignal).version !== 1
    || !['offer', 'answer'].includes((signal as PairingSignal).type)
    || typeof (signal as PairingSignal).sessionId !== 'string'
    || typeof (signal as PairingSignal).description?.sdp !== 'string'
  ) {
    throw new Error('配对码格式不受支持')
  }
  return signal as PairingSignal
}

function randomToken(length: number): string {
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += ROOM_ALPHABET[browserCryptoRandomInt(ROOM_ALPHABET.length)]
  }
  return result
}

function waitForIceGathering(connection: RTCPeerConnection, timeoutMs = 10_000): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const timeout = window.setTimeout(finish, timeoutMs)
    function finish(): void {
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', check)
      resolve()
    }
    function check(): void {
      if (connection.iceGatheringState === 'complete') finish()
    }
    connection.addEventListener('icegatheringstatechange', check)
  })
}

function validateProfile(profile: PlayerProfile | undefined): PlayerProfile {
  if (!profile?.name.trim()) throw new Error('请输入名字')
  return {
    id: profile.id.slice(0, 64),
    name: profile.name.trim().slice(0, 16),
    avatar: profile.avatar.slice(0, 400_000),
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

export class HostPeerRoom {
  readonly selfId: string
  private readonly state: GameState
  private readonly listeners = new Set<Listener>()
  private readonly sessions = new Map<string, HostSession>()
  private readonly timer: number

  constructor(profile: PlayerProfile, config: Partial<GameConfig>) {
    const safeProfile = validateProfile(profile)
    this.selfId = safeProfile.id
    this.state = createGame(randomToken(6), [safeProfile], config)
    this.timer = window.setInterval(() => this.handleTimeout(), 500)
  }

  get roomCode(): string {
    return this.state.roomCode
  }

  get peerCount(): number {
    return [...this.sessions.values()].filter(({ channel }) => channel.readyState === 'open').length
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  snapshot(): PeerStateMessage {
    return {
      type: 'state',
      state: publicStateFor(this.state, this.selfId),
      legal: legalActions(this.state, this.selfId),
      selfId: this.selfId,
      isHost: true,
    }
  }

  async createInvite(): Promise<string> {
    const sessionId = randomToken(10)
    const connection = new RTCPeerConnection(RTC_CONFIGURATION)
    const channel = connection.createDataChannel('glass-holdem', { ordered: true })
    const session: HostSession = { connection, channel }
    this.sessions.set(sessionId, session)
    this.bindHostSession(sessionId, session)

    await connection.setLocalDescription(await connection.createOffer())
    await waitForIceGathering(connection)
    if (!connection.localDescription) throw new Error('浏览器没有生成邀请信息')

    return encodePairingSignal({
      version: 1,
      type: 'offer',
      sessionId,
      description: connection.localDescription.toJSON(),
      room: {
        code: this.state.roomCode,
        name: this.state.config.roomName,
        host: this.state.players[0].name,
      },
    })
  }

  async acceptAnswer(code: string): Promise<void> {
    const signal = decodePairingSignal(code)
    if (signal.type !== 'answer') throw new Error('请扫描玩家设备上的应答二维码')
    const session = this.sessions.get(signal.sessionId)
    if (!session) throw new Error('应答与当前邀请不匹配，请重新生成邀请')
    await session.connection.setRemoteDescription(signal.description)
    this.emitStatus('waiting')
  }

  startHand(): void {
    startHand(this.state, browserCryptoRandomInt)
    this.broadcast()
  }

  action(action: PlayerAction, raiseTo?: number): void {
    applyAction(this.state, this.selfId, action, raiseTo)
    this.broadcast()
  }

  close(): void {
    window.clearInterval(this.timer)
    for (const session of this.sessions.values()) {
      session.channel.close()
      session.connection.close()
    }
    this.sessions.clear()
  }

  private bindHostSession(sessionId: string, session: HostSession): void {
    session.channel.addEventListener('message', (event) => this.handleClientMessage(session, String(event.data)))
    session.channel.addEventListener('open', () => this.emitStatus('connected', session.playerName))
    session.channel.addEventListener('close', () => this.disconnectSession(session))
    session.connection.addEventListener('connectionstatechange', () => {
      const status = session.connection.connectionState
      this.emitStatus(status, session.playerName)
      if (status === 'failed' || status === 'closed') {
        this.disconnectSession(session)
        this.sessions.delete(sessionId)
      }
    })
  }

  private handleClientMessage(session: HostSession, raw: string): void {
    try {
      const message = JSON.parse(raw) as ClientMessage
      if (message.type === 'ping') return
      if (message.type === 'join') {
        const profile = validateProfile(message.profile)
        const existing = this.state.players.find((player) => player.id === profile.id)
        if (existing) {
          existing.name = profile.name
          existing.avatar = profile.avatar
          existing.connected = true
        } else {
          addPlayer(this.state, profile)
        }
        session.playerId = profile.id
        session.playerName = profile.name
        this.broadcast()
        this.emitStatus('connected', profile.name)
        return
      }
      if (!session.playerId) throw new Error('玩家尚未完成入座')
      if (message.type === 'action' && message.action) {
        applyAction(this.state, session.playerId, message.action, message.raiseTo)
        this.broadcast()
        return
      }
      throw new Error('无法识别的牌局消息')
    } catch (error) {
      this.send(session.channel, {
        type: 'error',
        message: error instanceof Error ? error.message : '操作失败',
      })
    }
  }

  private disconnectSession(session: HostSession): void {
    if (!session.playerId) return
    const player = this.state.players.find((candidate) => candidate.id === session.playerId)
    if (player) player.connected = false
    this.broadcast()
  }

  private handleTimeout(): void {
    if (this.state.actorIndex < 0 || !this.state.actionDeadline || Date.now() < this.state.actionDeadline) return
    const player = this.state.players[this.state.actorIndex]
    const legal = legalActions(this.state, player.id)
    try {
      applyAction(this.state, player.id, legal.canCheck ? 'check' : 'fold')
      this.broadcast()
    } catch {
      // 下一轮计时再次尝试，避免一个异常打断房主页面。
    }
  }

  private broadcast(): void {
    this.emit(this.snapshot())
    for (const session of this.sessions.values()) {
      if (!session.playerId || session.channel.readyState !== 'open') continue
      this.send(session.channel, {
        type: 'state',
        state: publicStateFor(this.state, session.playerId),
        legal: legalActions(this.state, session.playerId),
        selfId: session.playerId,
        isHost: false,
      } satisfies PeerStateMessage)
    }
  }

  private emitStatus(status: PeerStatusMessage['status'], playerName?: string): void {
    this.emit({ type: 'status', status, peerCount: this.peerCount, playerName })
  }

  private emit(message: PeerRoomMessage): void {
    for (const listener of this.listeners) listener(message)
  }

  private send(channel: RTCDataChannel, payload: unknown): void {
    if (channel.readyState === 'open') channel.send(JSON.stringify(payload))
  }
}

export class GuestPeerRoom {
  private readonly profile: PlayerProfile
  private readonly listeners = new Set<Listener>()
  private connection: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private heartbeat: number | null = null

  constructor(profile: PlayerProfile) {
    this.profile = validateProfile(profile)
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  inspectOffer(code: string): RoomSummary {
    const signal = decodePairingSignal(code)
    if (signal.type !== 'offer' || !signal.room) throw new Error('请扫描房主设备上的邀请二维码')
    return signal.room
  }

  async acceptOffer(code: string): Promise<{ answer: string; room: RoomSummary }> {
    const signal = decodePairingSignal(code)
    if (signal.type !== 'offer' || !signal.room) throw new Error('请扫描房主设备上的邀请二维码')
    this.close()

    const connection = new RTCPeerConnection(RTC_CONFIGURATION)
    this.connection = connection
    connection.addEventListener('datachannel', (event) => this.bindChannel(event.channel))
    connection.addEventListener('connectionstatechange', () => {
      this.emit({ type: 'status', status: connection.connectionState, peerCount: connection.connectionState === 'connected' ? 1 : 0 })
    })
    await connection.setRemoteDescription(signal.description)
    await connection.setLocalDescription(await connection.createAnswer())
    await waitForIceGathering(connection)
    if (!connection.localDescription) throw new Error('浏览器没有生成应答信息')

    return {
      room: signal.room,
      answer: encodePairingSignal({
        version: 1,
        type: 'answer',
        sessionId: signal.sessionId,
        description: connection.localDescription.toJSON(),
      }),
    }
  }

  action(action: PlayerAction, raiseTo?: number): void {
    this.send({ type: 'action', action, raiseTo })
  }

  close(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat)
    this.heartbeat = null
    this.channel?.close()
    this.connection?.close()
    this.channel = null
    this.connection = null
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel
    channel.addEventListener('open', () => {
      this.send({ type: 'join', profile: this.profile })
      this.heartbeat = window.setInterval(() => this.send({ type: 'ping' }), 15_000)
    })
    channel.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as PeerRoomMessage
        this.emit(message)
      } catch {
        this.emit({ type: 'error', message: '收到无法解析的牌局数据' })
      }
    })
    channel.addEventListener('close', () => {
      if (this.heartbeat !== null) window.clearInterval(this.heartbeat)
      this.heartbeat = null
      this.emit({ type: 'status', status: 'closed', peerCount: 0 })
    })
  }

  private send(payload: ClientMessage): void {
    if (!this.channel || this.channel.readyState !== 'open') throw new Error('点对点连接尚未建立')
    this.channel.send(JSON.stringify(payload))
  }

  private emit(message: PeerRoomMessage): void {
    for (const listener of this.listeners) listener(message)
  }
}

export function legalWhenWaiting(): LegalActions {
  return emptyLegal()
}
