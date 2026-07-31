/**
 * Viewport smoke check. Drives local practice through a hand and screenshots the
 * three target form factors, asserting nothing overflows or gets clipped.
 *
 * Run: node tests/visual.mjs   (needs `npm run preview` on :4173)
 */
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-results/visual'

const TARGETS = [
  { name: 'desktop', viewport: { width: 1920, height: 1080 }, dsf: 1, insets: null },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dsf: 2, insets: { top: 0, right: 0, bottom: 20, left: 0 } },
  // iPhone 15 Pro landscape: the Dynamic Island pushes a 59px inset onto the
  // leading edge, and the home indicator takes 21px off the bottom.
  { name: 'iphone-landscape-island', viewport: { width: 852, height: 393 }, dsf: 3, insets: { top: 0, right: 59, bottom: 21, left: 59 } },
]

/** env(safe-area-inset-*) cannot be emulated, so inject the same values. */
function insetCss(insets) {
  if (!insets) return ''
  return `:root {
    --safe-top: ${insets.top}px !important;
    --safe-right: ${insets.right}px !important;
    --safe-bottom: ${insets.bottom}px !important;
    --safe-left: ${insets.left}px !important;
  }`
}

const problems = []

function report(target, message) {
  problems.push(`[${target}] ${message}`)
}

/** Elements that must stay fully inside the viewport and its safe insets. */
async function checkBounds(page, target, insets) {
  const safe = insets ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const findings = await page.evaluate(({ safe }) => {
    const out = []
    const vw = window.innerWidth
    const vh = window.innerHeight
    const watch = [
      '.table-corner', '.blinds-panel', '.table-rail', '.action-dock',
      '.action-buttons', '.table-status', '.between-hands', '.table-stage',
      '.seat-slot', '.seat-clock', '.deal-button', '.invite-button',
      // The cards overhang their seat slot, so they need checking directly —
      // a slot fully inside the viewport can still have clipped cards.
      '.seat-cards', '.seat-strength', '.player-seat', '.poker-table',
    ]
    for (const selector of watch) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) continue
        const slot = el.closest('.seat-slot')
        const slotName = slot ? [...slot.classList].find((c) => c.startsWith('seat-slot--')) : null
        const label = slotName ? `${selector} in .${slotName}` : selector
        if (r.left < safe.left - 1) out.push(`${label} overflows left (${Math.round(r.left)} < ${safe.left})`)
        if (r.right > vw - safe.right + 1) out.push(`${label} overflows right (${Math.round(r.right)} > ${vw - safe.right})`)
        if (r.top < safe.top - 1) out.push(`${label} overflows top (${Math.round(r.top)} < ${safe.top})`)
        if (r.bottom > vh - safe.bottom + 1) out.push(`${label} overflows bottom (${Math.round(r.bottom)} > ${vh - safe.bottom})`)
      }
    }
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push(`horizontal scroll (${document.documentElement.scrollWidth} > ${vw})`)
    }
    return out
  }, { safe })
  for (const finding of findings) report(target, finding)
}

/** The countdown must be visible and not covered by the seat frame. */
async function checkCountdown(page, target) {
  const result = await page.evaluate(() => {
    const clock = document.querySelector('.seat-clock')
    if (!clock) return { missing: true }
    const r = clock.getBoundingClientRect()
    if (r.width === 0) return { missing: true }
    // Hit-test the ring's centre: if the frame or anything else is painted on
    // top, the element under the point will not be the clock or its child.
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    const covered = !(hit && (hit.closest('.seat-clock')))
    return { missing: false, covered, hit: hit ? hit.className.toString() : 'none' }
  })
  if (result.missing) report(target, 'countdown ring not rendered while a player is acting')
  else if (result.covered) report(target, `countdown ring is occluded by "${result.hit}"`)
}

/** How much of the stage the felt actually occupies. */
async function feltRatio(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('.table-stage')
    const felt = document.querySelector('.poker-table')
    if (!stage || !felt) return null
    const s = stage.getBoundingClientRect()
    const f = felt.getBoundingClientRect()
    return {
      stage: `${Math.round(s.width)}x${Math.round(s.height)}`,
      felt: `${Math.round(f.width)}x${Math.round(f.height)}`,
      ratio: +((f.width * f.height) / (s.width * s.height)).toFixed(3),
    }
  })
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const target of TARGETS) {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: target.dsf,
    isMobile: target.name.startsWith('iphone') || target.name.startsWith('ipad'),
    hasTouch: target.name !== 'desktop',
    userAgent: target.name === 'desktop' ? undefined : devices['iPhone 15 Pro landscape'].userAgent,
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto(BASE, { waitUntil: 'networkidle' })
  if (target.insets) await page.addStyleTag({ content: insetCss(target.insets) })

  // Lobby → local practice, which is the path that shows every table element.
  await page.getByRole('button', { name: /离线练习|练习/ }).first().click()
  await page.waitForSelector('.table-stage', { timeout: 10000 })
  await page.waitForTimeout(2500)

  const metrics = await feltRatio(page)
  console.log(`${target.name}: stage ${metrics?.stage}  felt ${metrics?.felt}  felt/stage ${metrics?.ratio}`)
  if (metrics && metrics.ratio < 0.3) {
    report(target.name, `felt occupies only ${(metrics.ratio * 100).toFixed(0)}% of the stage`)
  }

  await checkBounds(page, target.name, target.insets)
  await checkCountdown(page, target.name)
  await page.screenshot({ path: `${OUT}/${target.name}.png` })

  for (const error of errors) report(target.name, `console error: ${error}`)
  await context.close()
}

await browser.close()

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('\nNo layout problems found.')
}
