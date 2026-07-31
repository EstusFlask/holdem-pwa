import type { ColorMode } from './storage'

/** Browser chrome colour per resolved theme, so the PWA frame matches the page. */
const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: '#dce8f6',
  dark: '#07131d',
}

const systemDark = matchMedia('(prefers-color-scheme: dark)')
let current: ColorMode = 'system'

export function resolveColorMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'system') return systemDark.matches ? 'dark' : 'light'
  return mode
}

/**
 * Writes the resolved theme onto `<html>`. Everything visual keys off
 * `data-theme`, so a single attribute flip re-themes the whole app without any
 * component needing to know which mode it is in.
 */
export function applyColorMode(mode: ColorMode): void {
  current = mode
  const resolved = resolveColorMode(mode)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}

/** Keeps `system` in step with the OS while the app is open. */
export function watchSystemColorMode(): () => void {
  const onChange = (): void => {
    if (current === 'system') applyColorMode('system')
  }
  systemDark.addEventListener('change', onChange)
  return () => systemDark.removeEventListener('change', onChange)
}
