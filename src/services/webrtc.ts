import { deflate, inflate } from 'pako'
import {
  addPlayer,
  applyAction,
  createGame,
  legalActions,
  publicStateFor,
  rebuyAll,
  seatPlayer,
  startHand,
} from '../game/engine'
import { browserCryptoRandomInt } from '../game/random'
import type { GameConfig, GameState, LegalActions, PlayerAction, PlayerProfile } from '../game/types'

const SIGNAL_PREFIX = 'GH1.'
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const RTC_CONFIGURATION: RTCConfiguration = { iceServers: [] }
const ICE_GATHERING_TIMEOUT_MS = 15_000
const JOIN_TIMEOUT_MS = 20_000

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
  joinTimer?: number
  resolveJoin?: (playerName: string) => void
  rejectJoin?: (error: Error) => void
  settled?: boolean
}

/** Whether a player can be seated right now, or has to wait for the hand to end. */
function seatsAreOpen(state: GameState): boolean {
  return state.phase === 'lobby' || state.phase === 'complete'
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
  const candidate = signal as PairingSignal
  if (
    !signal
    || typeof signal !== 'object'
    || candidate.version !== 1
    || !['offer', 'answer'].includes(candidate.type)
    || typeof candidate.sessionId !== 'string'
    || candidate.sessionId.length < 1
    || candidate.sessionId.length > 64
    || ![...candidate.sessionId].every((character) => ROOM_ALPHABET.includes(character))
    || !candidate.description
    || candidate.description.type !== candidate.type
    || typeof candidate.description.sdp !== 'string'
    || !candidate.description.sdp.trim()
    || (candidate.type === 'offer' && (
      !candidate.room
      || typeof candidate.room.code !== 'string'
      || typeof candidate.room.name !== 'string'
      || typeof candidate.room.host !== 'string'
      || !candidate.room.code.trim()
      || !candidate.room.name.trim()
      || !candidate.room.host.trim()
    ))
  ) {
    throw new Error('配对码格式不受支持')
  }
  return candidate
}

function randomToken(length: number): string {
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += ROOM_ALPHABET[browserCryptoRandomInt(ROOM_ALPHABET.length)]
  }
  return result
}

function waitForIceGathering(
  connection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = window.setTimeout(() => {
      finish(new Error('未能收集完整的局域网连接信息，请确认已允许本地网络访问后重试'))
    }, timeoutMs)

    function finish(error?: Error): void {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      connection.removeEventListener('icegatheringstatechange', check)
      connection.removeEventListener('icecandidate', checkCandidate)
      if (error) reject(error)
      else resolve()
    }

    function check(): void {
      if (connection.iceGatheringState === 'complete') finish()
    }

    function checkCandidate(event: RTCPeerConnectionIceEvent): void {
      if (!event.candidate && connection.iceGatheringState === 'complete') finish()
    }

    connection.addEventListener('icegatheringstatechange', check)
    connection.addEventListener('icecandidate', checkCandidate)
    check()
  })
}

function completeLocalDescription(connection: RTCPeerConnection, label: string): RTCSessionDescriptionInit {
  const description = connection.localDescription?.toJSON()
  if (!description?.sdp) throw new Error(`浏览器没有生成${label}信息`)
  if (!description.sdp.includes('a=candidate:')) {
    throw new Error('浏览器没有提供可用的局域网连接地址，请检查本地网络权限后重试')
  }
  return description
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
  /**
   * Players who paired while a hand was in play. Hands now follow each other
   * automatically, so the gap where a seat is free is short and unpredictable —
   * rejecting these would make joining a coin flip. They watch the hand out and
   * are seated when the next one starts.
   */
  private readonly pendingJoins = new Map<string, PlayerProfile>()
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

    try {
      await connection.setLocalDescription(await connection.createOffer())
      await waitForIceGathering(connection)
      const description = completeLocalDescription(connection, '邀请')

      return encodePairingSignal({
        version: 1,
        type: 'offer',
        sessionId,
        description,
        room: {
          code: this.state.roomCode,
          name: this.state.config.roomName,
          host: this.state.players[0].name,
        },
      })
    } catch (error) {
      this.failSession(sessionId, session, error)
      throw error
    }
  }

  async acceptAnswer(code: string): Promise<string> {
    const signal = decodePairingSignal(code)
    if (signal.type !== 'answer') throw new Error('请扫描玩家设备上的应答二维码')
    const session = this.sessions.get(signal.sessionId)
    if (!session || session.playerId) throw new Error('应答与当前邀请不匹配，请重新生成邀请')
    if (session.resolveJoin) throw new Error('正在处理这份应答，请稍候')

    const joined = new Promise<string>((resolve, reject) => {
      session.resolveJoin = resolve
      session.rejectJoin = reject
      session.joinTimer = window.setTimeout(() => {
        this.failSession(
          signal.sessionId,
          session,
          new Error('连接超时，请确认两台设备在同一 Wi-Fi 或热点，并检查网络是否禁止设备互访'),
        )
      }, JOIN_TIMEOUT_MS)
    })

    try {
      await session.connection.setRemoteDescription(signal.description)
      this.emitStatus('waiting')
    } catch {
      this.failSession(signal.sessionId, session, new Error('浏览器无法读取应答，请生成新邀请后重试'))
      return joined
    }

    return joined
  }

  startHand(): void {
    this.seatPendingJoins()
    startHand(this.state, browserCryptoRandomInt)
    this.broadcast()
  }

  /** Rebuys every seat to the starting stack and deals a fresh hand. */
  restart(): void {
    rebuyAll(this.state)
    this.seatPendingJoins()
    startHand(this.state, browserCryptoRandomInt)
    this.broadcast()
  }

  /** Seats everyone who paired mid-hand. Runs immediately before a deal. */
  private seatPendingJoins(): void {
    if (!this.pendingJoins.size) return
    for (const [id, profile] of this.pendingJoins) {
      this.pendingJoins.delete(id)
      if (this.state.players.some((player) => player.id === id)) continue
      try {
        seatPlayer(this.state, profile)
      } catch {
        // Table filled up while they waited; they stay connected as a spectator.
      }
    }
  }

  /** True when the table cannot deal again without a rebuy. */
  get needsRestart(): boolean {
    return this.state.players.filter((player) => player.connected && player.stack > 0).length < 2
  }

  action(action: PlayerAction, raiseTo?: number): void {
    applyAction(this.state, this.selfId, action, raiseTo)
    this.broadcast()
  }

  close(): void {
    window.clearInterval(this.timer)
    this.pendingJoins.clear()
    for (const [sessionId, session] of this.sessions) {
      if (session.playerId) {
        if (session.joinTimer !== undefined) window.clearTimeout(session.joinTimer)
        session.channel.close()
        session.connection.close()
      } else {
        this.failSession(sessionId, session, new Error('牌局已关闭'))
      }
    }
    this.sessions.clear()
  }

  private bindHostSession(sessionId: string, session: HostSession): void {
    session.channel.addEventListener('message', (event) => this.handleClientMessage(sessionId, session, String(event.data)))
    session.channel.addEventListener('open', () => this.emitStatus('connected', session.playerName))
    session.channel.addEventListener('close', () => {
      if (!session.playerId) {
        this.failSession(sessionId, session, new Error('连接已关闭，请生成新邀请后重试'))
      } else {
        this.disconnectSession(session)
      }
    })
    session.channel.addEventListener('error', () => {
      if (!session.playerId) this.failSession(sessionId, session, new Error('数据通道连接失败，请重新配对'))
    })
    session.connection.addEventListener('connectionstatechange', () => {
      const status = session.connection.connectionState
      this.emitStatus(status, session.playerName)
      if (status === 'failed' || status === 'closed') {
        if (!session.playerId) {
          this.failSession(sessionId, session, new Error('点对点连接失败，请确认两台设备可以在局域网内互访'))
        } else {
          this.disconnectSession(session)
          this.sessions.delete(sessionId)
        }
      }
    })
  }

  private handleClientMessage(sessionId: string, session: HostSession, raw: string): void {
    try {
      const message = JSON.parse(raw) as ClientMessage
      if (message.type === 'ping') return
      if (message.type === 'join') {
        const profile = validateProfile(message.profile)
        const existing = this.state.players.find((player) => player.id === profile.id)
        if (existing) {
          // Same profile id as a seat we already know: this is a reconnect, so the
          // player gets their stack back rather than a fresh buy-in.
          existing.name = profile.name
          existing.avatar = profile.avatar
          existing.connected = true
        } else if (seatsAreOpen(this.state)) {
          addPlayer(this.state, profile)
        } else {
          if (this.state.players.length + this.pendingJoins.size >= this.state.config.maxPlayers) {
            throw new Error('房间已满')
          }
          this.pendingJoins.set(profile.id, profile)
        }
        session.playerId = profile.id
        session.playerName = profile.name
        this.broadcast()
        this.emitStatus('connected', profile.name)
        this.completeSessionJoin(session, profile.name)
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
      const failure = error instanceof Error ? error : new Error('操作失败')
      this.send(session.channel, { type: 'error', message: failure.message })
      if (!session.playerId) this.failSession(sessionId, session, failure)
    }
  }

  private completeSessionJoin(session: HostSession, playerName: string): void {
    if (session.settled) return
    session.settled = true
    if (session.joinTimer !== undefined) window.clearTimeout(session.joinTimer)
    session.joinTimer = undefined
    const resolve = session.resolveJoin
    session.resolveJoin = undefined
    session.rejectJoin = undefined
    resolve?.(playerName)
  }

  private failSession(sessionId: string, session: HostSession, error: unknown): void {
    if (session.settled || session.playerId) return
    session.settled = true
    if (session.joinTimer !== undefined) window.clearTimeout(session.joinTimer)
    session.joinTimer = undefined
    const reject = session.rejectJoin
    session.resolveJoin = undefined
    session.rejectJoin = undefined
    this.sessions.delete(sessionId)
    session.channel.close()
    session.connection.close()
    reject?.(error instanceof Error ? error : new Error('点对点连接失败'))
  }

  private disconnectSession(session: HostSession): void {
    if (!session.playerId) return
    // Someone who dropped while queued never took a seat, so drop the reservation
    // rather than seating an absent player at the next deal.
    this.pendingJoins.delete(session.playerId)
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

    try {
      await connection.setRemoteDescription(signal.description)
      await connection.setLocalDescription(await connection.createAnswer())
      await waitForIceGathering(connection)
      const description = completeLocalDescription(connection, '应答')

      return {
        room: signal.room,
        answer: encodePairingSignal({
          version: 1,
          type: 'answer',
          sessionId: signal.sessionId,
          description,
        }),
      }
    } catch (error) {
      this.close()
      throw error
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
