/**
 * Felt stability check: the community cards must not move while the pot appears,
 * clears, or takes chips in.
 *
 * Both jitters this guards were layout-driven. The pot label and the chip stack
 * used to be flex siblings of the board in a centred column, so anything about the
 * pot changing size shoved the board; and the pot value used to be tweened frame by
 * frame, which re-broke the amount into discs ~26 times per collect and shivered
 * the stack. So the assertion is the same for both: sample the board's box at 60Hz
 * through a whole hand and require it to hold still.
 *
 * Run: node tests/visual-felt-stability.mjs   (needs `npm run preview` on :4173)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-results/visual-felt'
/** Sub-pixel wobble from a re-layout is not what this is looking for. */
const TOLERANCE = 1.5

mkdirSync(OUT, { recursive: true })

const problems = []
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

/**
 * Installs a rAF sampler that records the board's box, the pot text, and the
 * drawn disc count on every frame. Sampling in the page (rather than polling from
 * the test) is the point: a 26-frame shiver inside one 620ms collect is invisible
 * to anything slower than the compositor.
 */
async function startSampling() {
  await page.evaluate(() => {
    const samples = []
    window.__samples = samples
    const tick = () => {
      const board = document.querySelector('.community-cards')
      const r = board?.getBoundingClientRect()
      samples.push({
        // Null preflop, when the board is not mounted at all. Kept as a frame
        // rather than skipped, so pot transitions that happen before the flop
        // still show up in the record.
        top: r ? r.top : null,
        left: r ? r.left : null,
        pot: document.querySelector('.pot-display strong')?.textContent?.trim() ?? '',
        hasPot: Boolean(document.querySelector('.pot-display')),
        // Only discs that actually render. A disc on its way out stays in the DOM
        // for a frame or two while Vue tears the transition down, and counting
        // those would flag churn the user cannot see.
        discs: [...document.querySelectorAll('.pot-chips img')]
          .filter((img) => img.getClientRects().length > 0).length,
      })
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
  })
}

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: /创建牌局/ }).click()
await page.waitForTimeout(400)
await page.locator('.practice-button').click()
await page.waitForSelector('.table-view')
// Sampling starts before the board exists: preflop there is no `.community-cards`
// at all, and the first thing worth measuring is where it lands when the flop
// mounts it. Frames without a board retain pot state but carry no position.
await startSampling()

/**
 * Drives several hands, betting on roughly every third action rather than only
 * checking through.
 *
 * A check-through hand collects the blinds once and leaves an 80-chip pot, which is
 * a single pile and never crosses a denomination boundary — precisely the case the
 * old tween looked fine in. Raising grows the pot across streets so it re-breaks
 * into new denominations, which is the transition that used to shiver.
 */
for (let step = 0; step < 150; step += 1) {
  if (step % 3 === 0) {
    const raise = page.locator('.action-button--raise')
    if (await raise.count() && await raise.isEnabled().catch(() => false)) {
      await raise.click({ timeout: 2000 }).catch(() => {})
      const confirm = page.locator('.bet-confirm')
      if (await confirm.count()) {
        await confirm.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(120)
        continue
      }
    }
  }
  const middle = page.locator('.action-button--call')
  if (await middle.count() && await middle.isEnabled().catch(() => false)) {
    await middle.click({ timeout: 2000 }).catch(() => {})
  }
  await page.waitForTimeout(120)
}

const samples = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf)
  return window.__samples
})
await page.screenshot({ path: `${OUT}/felt.png` })
await page.locator('.poker-table').screenshot({ path: `${OUT}/felt-table.png` })

if (samples.length < 200) {
  problems.push(`only ${samples.length} frames sampled — the hand probably never ran`)
}

// 1. The board never moves, whatever the pot is doing. Frames where it was not
//    mounted carry no position and are not drift.
const onFelt = samples.filter((s) => s.top !== null)
if (onFelt.length < 100) problems.push(`board only present for ${onFelt.length} frames`)
const tops = onFelt.map((s) => s.top)
const lefts = onFelt.map((s) => s.left)
const spreadTop = Math.max(...tops) - Math.min(...tops)
const spreadLeft = Math.max(...lefts) - Math.min(...lefts)

if (spreadTop > TOLERANCE) {
  // Report the frame it happened on, with the pot state either side, so a
  // regression points straight at which transition caused it.
  const worst = onFelt.reduce((a, b) => (Math.abs(b.top - tops[0]) > Math.abs(a.top - tops[0]) ? b : a))
  problems.push(
    `board moved vertically by ${spreadTop.toFixed(2)}px `
    + `(worst frame: top ${worst.top.toFixed(1)} vs ${tops[0].toFixed(1)}, pot "${worst.pot}", ${worst.discs} discs)`,
  )
} else {
  console.log(`  ok board vertical drift ${spreadTop.toFixed(2)}px over ${samples.length} frames`)
}
if (spreadLeft > TOLERANCE) {
  problems.push(`board moved horizontally by ${spreadLeft.toFixed(2)}px`)
} else {
  console.log(`  ok board horizontal drift ${spreadLeft.toFixed(2)}px`)
}

// 2. The pot really did appear and clear during the run — otherwise the check above
//    passed only because nothing ever happened.
const potStates = new Set(samples.map((s) => s.hasPot))
const potValues = [...new Set(samples.map((s) => s.pot).filter(Boolean))]
if (!potStates.has(true) || !potStates.has(false)) {
  problems.push(`pot never toggled (states seen: ${[...potStates].join(', ')}) — nothing was tested`)
} else {
  console.log(`  ok pot appeared and cleared; values seen: ${potValues.join(', ')}`)
}

// 3. The pot value lands in one step. A tween writes a new number nearly every
//    frame, so the run of frames sharing one value is short; a single assignment
//    holds each value for the whole beat between collects.
const runs = []
for (const sample of samples) {
  const last = runs.at(-1)
  if (last && last.value === sample.pot) last.frames += 1
  else runs.push({ value: sample.pot, frames: 1 })
}
const valueRuns = runs.filter((run) => run.value)
const shortRuns = valueRuns.filter((run) => run.frames < 8)
if (shortRuns.length > 2) {
  problems.push(
    `pot value changed in ${shortRuns.length} short bursts — looks tweened, not stepped `
    + `(${shortRuns.slice(0, 6).map((r) => `${r.value}:${r.frames}f`).join(' ')})`,
  )
} else {
  console.log(`  ok pot value stepped: ${valueRuns.length} distinct holds, shortest ${Math.min(...valueRuns.map((r) => r.frames))} frames`)
}

// 4. The disc count is just as stable: it is what visibly shivered, since a pile's
//    height changes at every denomination boundary a tween crosses.
const discRuns = []
for (const sample of samples) {
  const last = discRuns.at(-1)
  if (last && last.discs === sample.discs) last.frames += 1
  else discRuns.push({ discs: sample.discs, frames: 1 })
}
const shortDiscRuns = discRuns.filter((run) => run.discs > 0 && run.frames < 8)
if (shortDiscRuns.length > 2) {
  problems.push(
    `chip stack rebuilt in ${shortDiscRuns.length} short bursts — pot is still being tweened `
    + `(${shortDiscRuns.slice(0, 6).map((r) => `${r.discs}discs:${r.frames}f`).join(' ')})`,
  )
} else {
  console.log(`  ok chip stack stepped: ${discRuns.length} distinct holds`)
}

await browser.close()

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ✗ ${problem}`)
  process.exit(1)
}
console.log('\nfelt stability: all checks passed')
