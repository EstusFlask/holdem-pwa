import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface CardManifest {
  suits: string[]
  ranks: string[]
  cardCount: number
}

const CARD_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'assets',
  'cards',
  'default',
)

function rankPath(svg: string, file: string): { path: string; transform: string } {
  const match = svg.match(/<g id="i[^"]+">\s*<path\b([^>]*)\/>/)
  expect(match, `${file} should contain one vector rank path`).not.toBeNull()
  const attributes = Object.fromEntries(
    [...match![1].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]),
  )
  expect(attributes.fill, `${file} rank colour`).toBeTruthy()
  expect(attributes.stroke, `${file} rank stroke`).toBeTruthy()
  expect(attributes['stroke-width'], `${file} rank stroke width`).toBe('80')
  expect(attributes['stroke-linecap'], `${file} rank line cap`).toBe('square')
  return { path: attributes.d, transform: attributes.transform }
}

describe('default jumbo card deck', () => {
  it('contains all ranks as deterministic vector paths with a shared ink box', async () => {
    const manifest = JSON.parse(
      await readFile(join(CARD_DIR, 'manifest.json'), 'utf8'),
    ) as CardManifest
    expect(manifest.suits.length * manifest.ranks.length).toBe(manifest.cardCount)
    expect(manifest.cardCount).toBe(52)

    const signatures = new Map<string, { path: string; transform: string }>()
    for (const suit of manifest.suits) {
      for (const rank of manifest.ranks) {
        const file = `${suit}-${rank}.svg`
        const svg = await readFile(join(CARD_DIR, file), 'utf8')
        const signature = rankPath(svg, file)
        expect(signature.path, `${file} rank path`).toBeTruthy()
        expect(signature.transform, `${file} rank transform`).toMatch(/^matrix\(/)
        signatures.set(rank, signature)
      }
    }

    expect(signatures.size).toBe(manifest.ranks.length)
    expect(new Set([...signatures.values()].map(({ path }) => path)).size).toBe(13)
  })
})
