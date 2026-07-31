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
 * Deterministic rank outlines adapted from the CC0 classic deck. `bounds` are
 * the painted bounds of each stroked path, including its square line caps. The
 * generator maps those bounds into one shared box, so alignment follows visible
 * ink rather than a font's em square, baseline, or side bearings.
 */
const RANKS = {
  A: {
    path: 'M-270 460L-110 460M-200 450L0 -460L200 450M110 460L270 460M-120 130L120 130',
    bounds: [-310, -469, 620, 969],
  },
  2: {
    path: 'M-225 -225C-245 -265 -200 -460 0 -460C200 -460 225 -325 225 -225C225 -25 -225 160 -225 460L225 460L225 300',
    bounds: [-269.5, -500, 534.5, 1000],
  },
  3: {
    path: 'M-250 -320L-250 -460L200 -460L-110 -80C-100 -90 -50 -120 0 -120C200 -120 250 0 250 150C250 350 170 460 -30 460C-230 460 -260 300 -260 300',
    bounds: [-307, -500, 597, 1000],
  },
  4: {
    path: 'M50 460L250 460M150 460L150 -460L-300 175L-300 200L270 200',
    bounds: [-340, -483.5, 650, 983.5],
  },
  5: {
    path: 'M170 -460L-175 -460L-210 -115C-210 -115 -200 -200 0 -200C100 -200 255 -80 255 120C255 320 180 460 -20 460C-220 460 -255 285 -255 285',
    bounds: [-302, -500, 597, 1000],
  },
  6: {
    path: 'M-250 100A250 250 0 0 1 250 100L250 210A250 250 0 0 1 -250 210L-250 -210A250 250 0 0 1 0 -460C150 -460 180 -400 200 -375',
    bounds: [-290, -500, 580, 1000],
  },
  7: {
    path: 'M-265 -320L-265 -460L265 -460C135 -200 -90 100 -90 460',
    bounds: [-305, -500, 606, 1000],
  },
  8: {
    path: 'M-1 -50A205 205 0 1 1 1 -50L-1 -50A255 255 0 1 0 1 -50Z',
    bounds: [-295, -500, 590, 1000],
  },
  9: {
    path: 'M250 -100A250 250 0 0 1 -250 -100L-250 -210A250 250 0 0 1 250 -210L250 210A250 250 0 0 1 0 460C-150 460 -180 400 -200 375',
    bounds: [-290, -500, 580, 1000],
  },
  10: {
    path: 'M-260 430L-260 -430M-50 0L-50 -310A150 150 0 0 1 250 -310L250 310A150 150 0 0 1 -50 310Z',
    bounds: [-300, -500, 590, 1000],
  },
  J: {
    path: 'M50 -460L250 -460M150 -460L150 250A100 100 0 0 1 -250 250L-250 220',
    bounds: [-290, -500, 580, 990],
  },
  Q: {
    path: 'M-260 100C40 100 -40 460 260 460M-175 0L-175 -285A175 175 0 0 1 175 -285L175 285A175 175 0 0 1 -175 285Z',
    bounds: [-300, -500, 600, 1000],
  },
  K: {
    path: 'M-285 -460L-85 -460M-185 -460L-185 460M-285 460L-85 460M85 -460L285 -460M185 -440L-170 155M85 460L285 460M185 440L-10 -70',
    bounds: [-325, -500, 650, 1000],
  },
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
  rankBox: { x: -104, y: -154, width: 72, height: 100 },
  smallPip: { cx: -80, cy: -36, size: 36 },
  bigPip: { cx: 22, cy: 52, size: 128 },
}

/** A centred `<use>` box for a pip, corrected by the suit's apparent-size scale. */
function pip(id, { cx, cy, size }, scale) {
  const box = round(size * scale)
  return `<use xlink:href="#${id}" x="${round(cx - box / 2)}" y="${round(cy - box / 2)}" width="${box}" height="${box}"/>`
}

/** Maps a rank's painted path bounds exactly into the shared index box. */
function rankPath({ path, bounds }, colour) {
  const [minX, minY, width, height] = bounds
  const sx = L.rankBox.width / width
  const sy = L.rankBox.height / height
  const tx = L.rankBox.x - minX * sx
  const ty = L.rankBox.y - minY * sy
  return `<path d="${path}" transform="matrix(${round(sx)} 0 0 ${round(sy)} ${round(tx)} ${round(ty)})" fill="none" stroke="${colour}" stroke-width="80" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="1.5" vector-effect="none"/>`
}

function round(value) {
  return Number(value.toFixed(6))
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
${rankPath(glyph, colour)}
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
