import { browserToken } from '../game/random'

export interface LocalProfile {
  id: string
  name: string
  avatar: string
}

export interface LocalSettings {
  cardTheme: string
  backTheme: string
  chipTheme: string
  reduceMotion: boolean
  sound: boolean
}

const PROFILE_KEY = 'glass-holdem.profile.v1'
const SETTINGS_KEY = 'glass-holdem.settings.v1'

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
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    sound: true,
  }
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: LocalSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
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
