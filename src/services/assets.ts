import type { Rank, Suit } from '../game/types'
import { chipAssetFiles } from './chips'

export interface ThemeEntry {
  id: string
  name: string
  path: string
  license: string
  source: string
}

export interface ThemeRegistry {
  cards: ThemeEntry[]
  backs: ThemeEntry[]
  chips: ThemeEntry[]
}

export interface ValidationResult {
  valid: boolean
  checked: number
  expected: number
  errors: string[]
}

const suits: Suit[] = ['S', 'H', 'D', 'C']
const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export async function loadThemeRegistry(): Promise<ThemeRegistry> {
  const response = await fetch(`${import.meta.env.BASE_URL}assets/themes.json`)
  if (!response.ok) throw new Error('无法读取素材主题清单')
  return response.json() as Promise<ThemeRegistry>
}

async function assetExists(path: string): Promise<boolean> {
  try {
    const response = await fetch(path, { cache: 'no-cache' })
    return response.ok && (await response.blob()).size > 0
  } catch {
    return false
  }
}

export async function validateCardTheme(entry: ThemeEntry): Promise<ValidationResult> {
  const paths = suits.flatMap((suit) =>
    ranks.map((rank) => `${import.meta.env.BASE_URL}${entry.path}/${suit}-${rank}.svg`),
  )
  const results = await Promise.all(paths.map(assetExists))
  const errors = paths.filter((_, index) => !results[index]).map((path) => `缺少 ${path.split('/').at(-1)}`)
  return { valid: errors.length === 0, checked: paths.length - errors.length, expected: 52, errors }
}

export async function validateSingleAsset(entry: ThemeEntry, file: string): Promise<ValidationResult> {
  const valid = await assetExists(`${import.meta.env.BASE_URL}${entry.path}/${file}`)
  return { valid, checked: valid ? 1 : 0, expected: 1, errors: valid ? [] : [`缺少 ${file}`] }
}

/**
 * A chip theme is only usable if every denomination is present: the felt draws
 * the pot from the individual discs, so one missing file leaves a hole in it.
 */
export async function validateChipTheme(entry: ThemeEntry): Promise<ValidationResult> {
  const files = chipAssetFiles()
  const results = await Promise.all(
    files.map((file) => assetExists(`${import.meta.env.BASE_URL}${entry.path}/${file}`)),
  )
  const errors = files.filter((_, index) => !results[index]).map((file) => `缺少 ${file}`)
  return {
    valid: errors.length === 0,
    checked: files.length - errors.length,
    expected: files.length,
    errors,
  }
}
