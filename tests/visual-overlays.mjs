/**
 * Overlay check: drives local practice into an all-in so the cut-in plays, then
 * on to settlement, screenshotting both on every form factor. These are the two
 * full-screen animations, so they are the ones most likely to clip.
 *
 * Run: node tests/visual-overlays.mjs   (needs `npm run preview` on :4173)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-results/visual'

const TARGETS = [
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, insets: null },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, insets: { top: 0, right: 0, bottom: 20, left: 0 } },
  { name: 'iphone-landscape-island', viewport: { width: 852, height: 393 }, insets: { top: 0, right: 59, bottom: 21, left: 59 } },
]

const problems = []

function insetCss(insets) {
  if (!insets) return ''
  return `:root {
    --safe-top: ${insets.top}px !important;
    --safe-right: ${insets.right}px !important;
    --safe-bottom: ${insets.bottom}px !important;
    --safe-left: ${insets.left}px !important;
  }`
}

async function boundsOf(page, selectors, target, insets) {
  const safe = insets ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const findings = await page.evaluate(({ selectors, safe }) => {
    const out = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        if (r.left < safe.left - 1) out.push(`${selector} overflows left (${Math.round(r.left)})`)
        if (r.right > vw - safe.right + 1) out.push(`${selector} overflows right (${Math.round(r.right)} > ${vw - safe.right})`)
        if (r.top < safe.top - 1) out.push(`${selector} overflows top (${Math.round(r.top)})`)
        if (r.bottom > vh - safe.bottom + 1) out.push(`${selector} overflows bottom (${Math.round(r.bottom)} > ${vh - safe.bottom})`)
      }
    }
    return out
  }, { selectors, safe })
  for (const finding of findings) problems.push(`[${target}] ${finding}`)
}

/** Shoves all-in as the hero: open the sizing panel, take the max, confirm. */
async function shoveAllIn(page) {
  const raise = page.locator('.action-button--raise')
  await raise.waitFor({ state: 'visible', timeout: 15000 })
  if (await raise.isDisabled()) return false
  await raise.click()
  await page.locator('.bet-preset--allin').click()
  await page.locator('.bet-confirm').click()
  return true
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const target of TARGETS) {
  const context = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (target.insets) await page.addStyleTag({ content: insetCss(target.insets) })
  await page.getByRole('button', { name: /离线练习|练习/ }).first().click()
  await page.waitForSelector('.table-stage', { timeout: 10000 })
  await page.waitForTimeout(1800)

  // Cut-in: catch it mid-hold, which is where the art and wordmark both sit.
  const shoved = await shoveAllIn(page)
  if (!shoved) {
    problems.push(`[${target.name}] could not shove all-in (raise button disabled)`)
  } else {
    const cutIn = page.locator('.cut-in')
    try {
      await cutIn.waitFor({ state: 'visible', timeout: 6000 })
      await page.waitForTimeout(700)
      await boundsOf(page, ['.cut-in__copy', '.cut-in__title', '.cut-in__name', '.cut-in__art'], target.name, target.insets)
      await page.screenshot({ path: `${OUT}/${target.name}-cutin.png` })
    } catch {
      problems.push(`[${target.name}] all-in cut-in never appeared`)
    }
  }

  // Settlement: the hand runs itself out after the shove is called or folded to.
  const settle = page.locator('.settle')
  try {
    await settle.waitFor({ state: 'visible', timeout: 25000 })
    await page.waitForTimeout(1100)
    await boundsOf(page, ['.settle__band', '.settle__copy', '.settle__cards', '.settle__label', '.settle__name'], target.name, target.insets)
    await page.screenshot({ path: `${OUT}/${target.name}-settle.png` })
  } catch {
    problems.push(`[${target.name}] settlement banner never appeared`)
  }

  for (const error of errors) problems.push(`[${target.name}] console error: ${error}`)
  await context.close()
}

await browser.close()

if (problems.length) {
  console.log(`${problems.length} problem(s):`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('No overlay problems found.')
}
