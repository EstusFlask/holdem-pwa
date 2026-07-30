import type { GameConfig, GameState, LegalActions, PlayerAction, PlayerProfile } from '../game/types'

export interface ServerStateMessage {
  type: 'state'
  state: GameState
  legal: LegalActions
  selfId: string
  isHost: boolean
}

export interface ServerErrorMessage {
  type: 'error'
  message: string
}

type Listener = (message: ServerStateMessage | ServerErrorMessage | { type: string }) => void

export function normalizeServerUrl(input: string): string {
  const value = input.trim()
  if (!value) throw new Error('请输入房主服务地址')
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`
  const url = new URL(withScheme)
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:'
  url.pathname = '/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export class RoomSocket {
  private socket: WebSocket | null = null
  private listeners = new Set<Listener>()
  private heartbeat: number | null = null

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async connect(address: string): Promise<void> {
    this.close()
    const url = normalizeServerUrl(address)
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url)
      const timeout = window.setTimeout(() => {
        socket.close()
        reject(new Error('连接房主服务超时'))
      }, 8000)

      socket.addEventListener('open', () => {
        clearTimeout(timeout)
        this.socket = socket
        this.heartbeat = window.setInterval(() => this.send({ type: 'ping' }), 15_000)
        resolve()
      })
      socket.addEventListener('error', () => {
        clearTimeout(timeout)
        reject(new Error('无法连接。请先在浏览器中打开房主 HTTPS 地址并确认本地证书。'))
      })
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data)) as Parameters<Listener>[0]
          for (const listener of this.listeners) listener(message)
        } catch {
          // 忽略非 JSON 服务消息。
        }
      })
      socket.addEventListener('close', () => {
        if (this.heartbeat) window.clearInterval(this.heartbeat)
        this.heartbeat = null
      })
    })
  }

  createRoom(profile: PlayerProfile, config: Partial<GameConfig>): void {
    this.send({ type: 'create-room', profile, config })
  }

  joinRoom(profile: PlayerProfile, roomCode: string): void {
    this.send({ type: 'join-room', profile, roomCode })
  }

  startHand(): void {
    this.send({ type: 'start-hand' })
  }

  action(action: PlayerAction, raiseTo?: number): void {
    this.send({ type: 'action', action, raiseTo })
  }

  close(): void {
    if (this.heartbeat) window.clearInterval(this.heartbeat)
    this.heartbeat = null
    this.socket?.close()
    this.socket = null
  }

  private send(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('尚未连接房主服务')
    this.socket.send(JSON.stringify(payload))
  }
}
