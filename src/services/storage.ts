import { browserToken } from '../game/random'

export interface LocalProfile {
  id: string
  name: string
  avatar: string
}

/** Appearance preference. `system` follows the OS light/dark setting. */
export type ColorMode = 'system' | 'light' | 'dark'

export interface LocalSettings {
  cardTheme: string
  backTheme: string
  chipTheme: string
  colorMode: ColorMode
  reduceMotion: boolean
  sound: boolean
}

/**
 * Enough of a room to offer a one-tap reconnect after an accidental tab close.
 * Peer-to-peer pairing has no signalling server, so the codes cannot be reused —
 * what this buys is skipping the lobby and going straight back to pairing with
 * the same profile id, which the host matches to the seat and stack you left.
 */
export interface RoomSession {
  role: 'host' | 'guest'
  roomName: string
  roomCode: string
  /** Host-only: the table settings, so the room can be rebuilt as it was. */
  config?: {
    roomName: string
    startingStack: number
    smallBlind: number
    bigBlind: number
  }
  savedAt: number
}

const PROFILE_KEY = 'glass-holdem.profile.v1'
const SETTINGS_KEY = 'glass-holdem.settings.v1'
const SESSION_KEY = 'glass-holdem.session.v1'

/** Past this a saved room is stale enough that offering it would be noise. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000

export function loadProfile(): LocalProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Partial<LocalProfile> | null
    if (saved?.id && saved.name) {
      return { id: saved.id, name: saved.name, avatar: saved.avatar ?? '' }
    }
  } catch {
    // 损坏的本地缓存会被安全地替换。
  }
  return { id: browserToken(), name: 'Player', avatar: '' }
}

export function saveProfile(profile: LocalProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function loadSettings(): LocalSettings {
  const defaults: LocalSettings = {
    cardTheme: 'default',
    backTheme: 'default',
    chipTheme: 'default',
    colorMode: 'system',
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    sound: true,
  }
  try {
    const saved = { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
    if (!['system', 'light', 'dark'].includes(saved.colorMode)) saved.colorMode = 'system'
    return saved
  } catch {
    return defaults
  }
}

export function saveSettings(settings: LocalSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function loadRoomSession(): RoomSession | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as RoomSession | null
    if (!saved || (saved.role !== 'host' && saved.role !== 'guest')) return null
    if (typeof saved.savedAt !== 'number' || Date.now() - saved.savedAt > SESSION_TTL_MS) {
      clearRoomSession()
      return null
    }
    return saved
  } catch {
    return null
  }
}

export function saveRoomSession(session: Omit<RoomSession, 'savedAt'>): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }))
}

export function clearRoomSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export async function imageFileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > 8 * 1024 * 1024) throw new Error('头像原图不能超过 8 MB')

  const bitmap = await createImageBitmap(file)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法处理头像')
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/webp', 0.82)
}
