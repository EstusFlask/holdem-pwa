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

const RANK_BOX = {
  x: '-104',
  y: '-78',
  'font-size': '100',
  'font-weight': '700',
  'text-anchor': 'start',
  textLength: '72',
  lengthAdjust: 'spacingAndGlyphs',
}

function textAttributes(svg: string): { rank: string; attributes: Record<string, string> } {
  const text = svg.match(/<text\b([^>]*)>([^<]+)<\/text>/)
  expect(text, 'card face should contain one rank text element').not.toBeNull()

  const attributes = Object.fromEntries(
    [...text![1].matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  )
  return { rank: text![2], attributes }
}

describe('default jumbo card deck', () => {
  it('renders every rank into the same aligned box', async () => {
    const manifest = JSON.parse(
      await readFile(join(CARD_DIR, 'manifest.json'), 'utf8'),
    ) as CardManifest
    expect(manifest.suits.length * manifest.ranks.length).toBe(manifest.cardCount)
    expect(manifest.cardCount).toBe(52)

    for (const suit of manifest.suits) {
      for (const rank of manifest.ranks) {
        const svg = await readFile(join(CARD_DIR, `${suit}-${rank}.svg`), 'utf8')
        const text = textAttributes(svg)
        expect(text.rank, `${suit}-${rank}.svg rank`).toBe(rank)
        expect(text.attributes, `${suit}-${rank}.svg rank box`).toMatchObject(RANK_BOX)
      }
    }
  })
})
