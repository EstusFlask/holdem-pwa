/**
 * Generates the "大字" (jumbo index) card faces into `public/assets/cards/default`.
 *
 * The design is a jumbo-index deck: one oversized rank in the top-left with a
 * small suit pip beneath it, one large suit pip in the middle, and no pip array
 * at all — a jumbo deck is read off the rank, so a 10 carries a single suit mark
 * rather than ten of them.
 *
 * There is deliberately no 180°-rotated second index: see `L` below.
 *
 * Geometry is in the same `-120 -168 240 336` user space as the classic deck, so
 * the faces are drop-in compatible with `CardFace`'s 2.5:3.5 box.
 *
 * Run: node tools/generate-jumbo-deck.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'cards', 'default')

const INK = { black: '#15181c', red: '#b0132a' }

/**
 * Suit pip outlines, taken from the CC0 `letele/playing-cards` set the classic
 * deck already ships, so both decks draw the same four shapes.
 *
 * `scale` normalises apparent size: the four paths share a 1200-unit box but not
 * their ink extents — the club is the narrowest and the diamond the airiest — so
 * an identical `<use>` box would render the club noticeably small.
 */
const SUITS = {
  S: {
    colour: INK.black,
    scale: 1,
    path: 'M0 -500C100 -250 355 -100 355 185A150 150 0 0 1 55 185A10 10 0 0 0 35 185C35 385 85 400 130 500L-130 500C-85 400 -35 385 -35 185A10 10 0 0 0 -55 185A150 150 0 0 1 -355 185C-355 -100 -100 -250 0 -500Z',
  },
  H: {
    colour: INK.red,
    scale: 0.98,
    path: 'M0 -300C0 -400 100 -500 200 -500C300 -500 400 -400 400 -250C400 0 0 400 0 500C0 400 -400 0 -400 -250C-400 -400 -300 -500 -200 -500C-100 -500 0 -400 -0 -300Z',
  },
  D: {
    colour: INK.red,
    scale: 0.96,
    path: 'M-400 0C-350 0 0 -450 0 -500C0 -450 350 0 400 0C350 0 0 450 0 500C0 450 -350 0 -400 0Z',
  },
  C: {
    colour: INK.black,
    scale: 1.08,
    path: 'M30 150C35 385 85 400 130 500L-130 500C-85 400 -35 385 -30 150A10 10 0 0 0 -50 150A210 210 0 1 1 -124 -51A10 10 0 0 0 -110 -65A230 230 0 1 1 110 -65A10 10 0 0 0 124 -51A210 210 0 1 1 50 150A10 10 0 0 0 30 150Z',
  },
}

/**
 * Per-rank glyph metrics.
 *
 * `width` pins the glyph's advance with `textLength`, which is what keeps the
 * layout identical across platforms: the faces name a serif stack rather than
 * shipping a font, so without pinning, a device falling back to a wider serif
 * could push the index off the card. Values are the mean advance of Georgia Bold
 * and Times New Roman Bold at the given size, so the pinning barely reshapes the
 * letterforms in either.
 *
 * `10` is set smaller, as on a real deck — two full-size digits would crowd the
 * card edge.
 */
const RANKS = {
  A: { size: 100, width: 72, x: -78 },
  2: { size: 100, width: 56, x: -78 },
  3: { size: 100, width: 56, x: -78 },
  4: { size: 100, width: 56, x: -78 },
  5: { size: 100, width: 56, x: -78 },
  6: { size: 100, width: 56, x: -78 },
  7: { size: 100, width: 56, x: -78 },
  8: { size: 100, width: 56, x: -78 },
  9: { size: 100, width: 56, x: -78 },
  // Two digits, so it is set smaller and given the width of the pair. Nudged right
  // of the single-digit centre because its own box is wider than theirs.
  10: { size: 86, width: 94, x: -70 },
  J: { size: 100, width: 46, x: -78 },
  Q: { size: 100, width: 78, x: -78 },
  K: { size: 100, width: 76, x: -78 },
}

/**
 * Shared layout, in card user units (the card spans x −120..120, y −168..168).
 *
 * One index block, top-left, and one pip below-right of it — no 180° repeat. A
 * jumbo index is large precisely so it can be read small, and at the ~100px the
 * board actually renders at there is not room for two index blocks *and* a pip
 * that size: a rotated bottom-right block lands on the pip whatever it is given.
 * Between a second index and a pip big enough to read, the pip wins, because the
 * suit is what a rank alone cannot tell you.
 */
const L = {
  rankBaseline: -78,
  smallPip: { cx: -80, cy: -44, size: 36 },
  bigPip: { cx: 22, cy: 52, size: 128 },
  font: "Georgia,'Times New Roman',Times,serif",
}

/** A centred `<use>` box for a pip, corrected by the suit's apparent-size scale. */
function pip(id, { cx, cy, size }, scale) {
  const box = round(size * scale)
  return `<use xlink:href="#${id}" x="${round(cx - box / 2)}" y="${round(cy - box / 2)}" width="${box}" height="${box}"/>`
}

function round(value) {
  return Number(value.toFixed(3))
}

function card(suit, rank) {
  const { colour, path, scale } = SUITS[suit]
  const glyph = RANKS[rank]
  const pipId = `p${suit}`
  /** Single-character rank code, matching the classic deck's `face` attribute. */
  const code = rank === '10' ? 'T' : rank
  const indexId = `i${suit}${code}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="card" face="${code}${suit}" width="2.5in" height="3.5in" viewBox="-120 -168 240 336">
<defs>
<symbol id="${pipId}" viewBox="-600 -600 1200 1200"><path d="${path}" fill="${colour}"/></symbol>
<g id="${indexId}">
<text x="${glyph.x}" y="${L.rankBaseline}" font-family="${L.font}" font-size="${glyph.size}" font-weight="700" text-anchor="middle" textLength="${glyph.width}" lengthAdjust="spacingAndGlyphs" fill="${colour}">${rank}</text>
${pip(pipId, L.smallPip, scale)}
</g>
</defs>
<rect x="-119.5" y="-167.5" width="239" height="335" rx="13" ry="13" fill="#ffffff" stroke="#ccd4dc"/>
<use xlink:href="#${indexId}"/>
${pip(pipId, L.bigPip, scale)}
</svg>
`
}

const manifest = {
  id: 'default',
  name: '大字',
  version: 1,
  license: 'CC0-1.0',
  source: 'https://github.com/letele/playing-cards',
  filePattern: '{suit}-{rank}.svg',
  suits: ['S', 'H', 'D', 'C'],
  ranks: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
  cardCount: 52,
  aspectRatio: '2.5/3.5',
}

await mkdir(OUT, { recursive: true })

let written = 0
for (const suit of Object.keys(SUITS)) {
  for (const rank of Object.keys(RANKS)) {
    await writeFile(join(OUT, `${suit}-${rank}.svg`), card(suit, rank), 'utf8')
    written += 1
  }
}
await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`wrote ${written} faces + manifest.json to ${OUT}`)
