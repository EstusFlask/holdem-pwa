import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { randomInt, randomUUID } from 'node:crypto'
import process from 'node:process'
import QRCode from 'qrcode'
import selfsigned from 'selfsigned'
import { WebSocket, WebSocketServer } from 'ws'
import {
  addPlayer,
  applyAction,
  createGame,
  legalActions,
  publicStateFor,
  startHand,
} from '../src/game/engine'
import type { GameConfig, GameState, PlayerAction, PlayerProfile } from '../src/game/types'

interface ClientSession {
  id: string
  profile: PlayerProfile | null
  roomCode: string | null
  isHost: boolean
  alive: boolean
}

interface Room {
  state: GameState
  hostId: string
  clients: Map<WebSocket, ClientSession>
}

interface ClientMessage {
  type: 'create-room' | 'join-room' | 'start-hand' | 'action' | 'ping'
  profile?: PlayerProfile
  roomCode?: string
  config?: Partial<GameConfig>
  action?: PlayerAction
  raiseTo?: number
}

const args = process.argv.slice(2)
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
const port = Number(valueAfter('--port') ?? process.env.PORT ?? 4173)
const host = valueAfter('--host') ?? '0.0.0.0'
const useHttp = args.includes('--http')
const distRoot = resolve(process.cwd(), 'dist')
const rooms = new Map<string, Room>()

if (!existsSync(join(distRoot, 'index.html'))) {
  console.error('未找到 dist/index.html。请先运行 npm run build，再运行 npm run host。')
  process.exit(1)
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

function localAddresses(): string[] {
  const addresses = new Set<string>(['127.0.0.1'])
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.add(entry.address)
    }
  }
  return [...addresses]
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  const rawPath = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  const requested = rawPath === '/' ? '/index.html' : rawPath
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '')
  let filePath = resolve(distRoot, `.${safePath}`)

  if (!filePath.startsWith(distRoot)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) filePath = join(distRoot, 'index.html')

  response.writeHead(200, {
    'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  createReadStream(filePath).pipe(response)
}

function createTlsServer() {
  const addresses = localAddresses()
  const certificateDirectory = resolve(process.cwd(), 'server', '.cert')
  const certificatePath = join(certificateDirectory, 'certificate.pem')
  const privateKeyPath = join(certificateDirectory, 'private-key.pem')
  const metadataPath = join(certificateDirectory, 'metadata.json')
  const addressSignature = addresses.join(',')
  let key: string
  let cert: string

  if (
    existsSync(certificatePath)
    && existsSync(privateKeyPath)
    && existsSync(metadataPath)
    && JSON.parse(readFileSync(metadataPath, 'utf8')).addresses === addressSignature
  ) {
    key = readFileSync(privateKeyPath, 'utf8')
    cert = readFileSync(certificatePath, 'utf8')
    return createHttpsServer({ key, cert }, serveStatic)
  }

  const altNames: Array<{ type: number; value: string; ip?: string }> = [
    { type: 2, value: 'localhost' },
    ...addresses.map((ip) => ({ type: 7, value: ip, ip })),
  ]
  const certificate = selfsigned.generate(
    [{ name: 'commonName', value: 'Glass Holdem Local' }],
    {
      keySize: 2048,
      days: 365,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
        { name: 'subjectAltName', altNames },
      ],
    },
  )
  key = certificate.private
  cert = certificate.cert
  mkdirSync(certificateDirectory, { recursive: true })
  writeFileSync(privateKeyPath, key, { mode: 0o600 })
  writeFileSync(certificatePath, cert)
  writeFileSync(metadataPath, JSON.stringify({ addresses: addressSignature }, null, 2))
  return createHttpsServer({ key, cert }, serveStatic)
}

const server = useHttp ? createHttpServer(serveStatic) : createTlsServer()
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 })

function secureRoomCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let result = ''
  for (let index = 0; index < 6; index += 1) result += alphabet[randomInt(alphabet.length)]
  return result
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

function broadcast(room: Room): void {
  for (const [socket, session] of room.clients) {
    if (!session.profile) continue
    send(socket, {
      type: 'state',
      state: publicStateFor(room.state, session.profile.id),
      legal: legalActions(room.state, session.profile.id),
      selfId: session.profile.id,
      isHost: session.isHost,
    })
  }
}

function validateProfile(profile: PlayerProfile | undefined): PlayerProfile {
  if (!profile || typeof profile.name !== 'string' || !profile.name.trim()) throw new Error('请输入名字')
  return {
    id: typeof profile.id === 'string' && profile.id.length >= 8 ? profile.id.slice(0, 64) : randomUUID(),
    name: profile.name.trim().slice(0, 16),
    avatar: typeof profile.avatar === 'string' ? profile.avatar.slice(0, 400_000) : '',
  }
}

function leaveCurrentRoom(socket: WebSocket, session: ClientSession): void {
  if (!session.roomCode) return
  const room = rooms.get(session.roomCode)
  if (!room) return
  room.clients.delete(socket)
  const player = room.state.players.find((candidate) => candidate.id === session.profile?.id)
  if (player) player.connected = false

  if (room.hostId === session.profile?.id) {
    const replacement = [...room.clients.values()].find((candidate) => candidate.profile)
    if (replacement?.profile) {
      room.hostId = replacement.profile.id
      replacement.isHost = true
    }
  }
  if (!room.clients.size) rooms.delete(session.roomCode)
  else broadcast(room)
}

function joinRoom(socket: WebSocket, session: ClientSession, roomCode: string, profile: PlayerProfile): void {
  const room = rooms.get(roomCode)
  if (!room) throw new Error('找不到这个房间')
  leaveCurrentRoom(socket, session)

  const existing = room.state.players.find((player) => player.id === profile.id)
  if (existing) {
    existing.connected = true
    existing.name = profile.name
    existing.avatar = profile.avatar
  } else {
    addPlayer(room.state, profile)
  }
  session.profile = profile
  session.roomCode = roomCode
  session.isHost = room.hostId === profile.id
  room.clients.set(socket, session)
  broadcast(room)
}

function handleMessage(socket: WebSocket, session: ClientSession, raw: WebSocket.RawData): void {
  try {
    const message = JSON.parse(raw.toString()) as ClientMessage
    if (message.type === 'ping') {
      send(socket, { type: 'pong', now: Date.now() })
      return
    }

    if (message.type === 'create-room') {
      const profile = validateProfile(message.profile)
      leaveCurrentRoom(socket, session)
      let roomCode = secureRoomCode()
      while (rooms.has(roomCode)) roomCode = secureRoomCode()
      const state = createGame(roomCode, [profile], message.config)
      const room: Room = { state, hostId: profile.id, clients: new Map() }
      rooms.set(roomCode, room)
      session.profile = profile
      session.roomCode = roomCode
      session.isHost = true
      room.clients.set(socket, session)
      broadcast(room)
      return
    }

    if (message.type === 'join-room') {
      joinRoom(socket, session, String(message.roomCode ?? '').toUpperCase(), validateProfile(message.profile))
      return
    }

    if (!session.roomCode || !session.profile) throw new Error('请先创建或加入房间')
    const room = rooms.get(session.roomCode)
    if (!room) throw new Error('房间已关闭')

    if (message.type === 'start-hand') {
      if (!session.isHost) throw new Error('只有房主可以开始手牌')
      startHand(room.state, randomInt)
    } else if (message.type === 'action') {
      if (!message.action) throw new Error('缺少操作')
      applyAction(room.state, session.profile.id, message.action, message.raiseTo)
    } else {
      throw new Error('未知消息')
    }
    broadcast(room)
  } catch (error) {
    send(socket, { type: 'error', message: error instanceof Error ? error.message : '操作失败' })
  }
}

wss.on('connection', (socket) => {
  const session: ClientSession = {
    id: randomUUID(),
    profile: null,
    roomCode: null,
    isHost: false,
    alive: true,
  }
  socket.on('pong', () => { session.alive = true })
  socket.on('message', (raw) => handleMessage(socket, session, raw))
  socket.on('close', () => leaveCurrentRoom(socket, session))
  send(socket, { type: 'hello', sessionId: session.id })
})

setInterval(() => {
  for (const room of rooms.values()) {
    const { state } = room
    if (state.actorIndex >= 0 && state.actionDeadline && Date.now() >= state.actionDeadline) {
      const player = state.players[state.actorIndex]
      const legal = legalActions(state, player.id)
      try {
        applyAction(state, player.id, legal.canCheck ? 'check' : 'fold')
        broadcast(room)
      } catch {
        // 下一次 tick 再尝试，避免单个房间中断服务。
      }
    }
  }
}, 500)

setInterval(() => {
  for (const socket of wss.clients) {
    const room = [...rooms.values()].find((candidate) => candidate.clients.has(socket))
    const session = room?.clients.get(socket)
    if (session && !session.alive) {
      socket.terminate()
      continue
    }
    if (session) session.alive = false
    socket.ping()
  }
}, 20_000)

server.listen(port, host, async () => {
  const scheme = useHttp ? 'http' : 'https'
  console.log(`\nGlass Hold'em 本地房主服务已启动（${useHttp ? 'HTTP 兼容模式' : 'HTTPS/WSS'}）`)
  for (const ip of localAddresses()) {
    const url = `${scheme}://${ip}:${port}/`
    console.log(`  ${url}`)
    if (ip !== '127.0.0.1') {
      try {
        console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
      } catch {
        // 终端不支持二维码时保留文本地址。
      }
    }
  }
  if (!useHttp) {
    console.log('首次连接：每台设备需打开上面的 HTTPS 地址并确认本地自签名证书。')
  }
  console.log('按 Ctrl+C 停止服务。\n')
})
