/**
 * Checks the five fixes: pot contrast on the felt, chips drawn from the actual
 * pot value, lobby boxes aligned to the steps strip, the join panel centred, and
 * view transitions actually running.
 *
 * Run: node tests/visual-fixes.mjs   (needs `npm run preview` on :4173)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-results/fixes'
const problems = []

/** WCAG contrast of two rgb strings. */
function contrast(fg, bg) {
  const parse = (v) => (v ?? '').match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  const lum = (c) => {
    const [r, g, b] = parse(c)
    const f = (x) => {
      const s = x / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const [l1, l2] = [lum(fg), lum(bg)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

/**
 * Catches a view mid-enter.
 *
 * The shell runs `mode="out-in"`, so the arriving view does not exist until the
 * leaving one has finished — polling for the element and sampling immediately is
 * the only way to land inside its enter phase. Returns the sampled style, or a
 * reason it could not be sampled; a null return would silently pass.
 */
async function sampleEnter(page, selector, { timeout = 8000 } = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const shot = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { transform: s.transform, filter: s.filter, opacity: Number(s.opacity) }
    }, selector)
    if (shot) return shot
    await page.waitForTimeout(16)
  }
  return { missing: true }
}

/** A view is animating if it is offset, scaled, blurred or not yet opaque. */
function isAnimating(shot) {
  if (!shot || shot.missing) return false
  const moved = shot.transform && shot.transform !== 'none'
  const blurred = shot.filter && shot.filter !== 'none'
  return Boolean(moved || blurred || shot.opacity < 0.99)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.addInitScript((mode) => {
    localStorage.setItem('glass-holdem.settings.v1', JSON.stringify({ colorMode: mode }))
  }, theme)
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  // ── 3. Lobby boxes align with the steps strip below them ────────────────
  const edges = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right) }
    }
    return {
      console: box('.lobby-console'),
      profile: box('.profile-panel'),
      steps: box('.connection-steps'),
    }
  })
  if (!edges.console || !edges.profile || !edges.steps) {
    problems.push(`[${theme}] lobby is missing console/profile/steps`)
  } else {
    const dl = Math.abs(edges.console.left - edges.steps.left)
    const dr = Math.abs(edges.profile.right - edges.steps.right)
    if (dl > 2) problems.push(`[${theme}] console left ${edges.console.left} vs steps ${edges.steps.left} (off by ${dl})`)
    if (dr > 2) problems.push(`[${theme}] profile right ${edges.profile.right} vs steps ${edges.steps.right} (off by ${dr})`)
  }
  await page.screenshot({ path: `${OUT}/${theme}-lobby.png` })

  // ── 5. Panel swap animates, and 4. the join panel is centred ────────────
  await page.getByRole('tab', { name: /加入牌局/ }).click()
  const midSwap = await sampleEnter(page, '.lobby-form--join')
  await page.screenshot({ path: `${OUT}/${theme}-join-mid.png` })
  if (midSwap.missing) problems.push(`[${theme}] join panel never rendered`)
  else if (!isAnimating(midSwap)) {
    problems.push(`[${theme}] join panel swap did not animate (${JSON.stringify(midSwap)})`)
  } else {
    console.log(`  ok [${theme}] join panel swap animated (opacity ${midSwap.opacity.toFixed(2)})`)
  }
  await page.waitForTimeout(500)

  const centring = await page.evaluate(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return (r.left + r.right) / 2 }
    const form = document.querySelector('.lobby-form--join')
    const button = form?.querySelector('.primary-action')
    const note = form?.querySelector('.form-note')
    if (!form || !button || !note) return null
    return {
      form: mid(form),
      button: mid(button),
      note: mid(note),
      noteAlign: getComputedStyle(note).textAlign,
    }
  })
  if (!centring) problems.push(`[${theme}] join panel has no button/note to centre`)
  else {
    if (Math.abs(centring.button - centring.form) > 2) {
      problems.push(`[${theme}] scan button off-centre by ${Math.round(Math.abs(centring.button - centring.form))}px`)
    }
    if (Math.abs(centring.note - centring.form) > 2) {
      problems.push(`[${theme}] wifi note off-centre by ${Math.round(Math.abs(centring.note - centring.form))}px`)
    }
    if (centring.noteAlign !== 'center') {
      problems.push(`[${theme}] wifi note text-align is ${centring.noteAlign}`)
    }
  }
  await page.screenshot({ path: `${OUT}/${theme}-join.png` })

  // ── 5. Entering the table animates (immersive) ──────────────────────────
  await page.getByRole('tab', { name: /创建牌局/ }).click()
  await page.waitForTimeout(500)
  await page.locator('.practice-button').click()
  const midEnter = await sampleEnter(page, '.table-view')
  await page.screenshot({ path: `${OUT}/${theme}-table-enter.png` })
  if (midEnter.missing) problems.push(`[${theme}] table view never mounted`)
  else if (!isAnimating(midEnter)) {
    problems.push(`[${theme}] table entry did not animate (${JSON.stringify(midEnter)})`)
  } else {
    // Starting offset alone is not motion — sample again to prove it travels,
    // then once more to prove it lands.
    await page.waitForTimeout(150)
    const part = await sampleEnter(page, '.table-view')
    await page.waitForTimeout(500)
    const done = await sampleEnter(page, '.table-view')
    if (!(part.opacity > midEnter.opacity)) {
      problems.push(`[${theme}] table entry stalled (opacity ${midEnter.opacity} → ${part.opacity})`)
    } else if (isAnimating(done)) {
      problems.push(`[${theme}] table entry never settled (${JSON.stringify(done)})`)
    } else {
      console.log(`  ok [${theme}] table entry ran ${midEnter.opacity.toFixed(2)} → ${part.opacity.toFixed(2)} → settled clean`)
    }
  }

  // ── 1 & 2. Pot label contrast, and chips matching the pot ───────────────
  // Preflop the blinds are still on the plates, so there is no pot on the felt
  // yet. Check/call through to the flop, which is where it first appears.
  //
  // The pot is transient — it lands when a street's bets are collected and clears
  // again when the hand settles — so presence and measurement have to happen in
  // the same evaluate, or the pot can be gone by the time it is read.
  await page.waitForSelector('.table-view', { timeout: 20000 })

  const readFelt = () => page.evaluate(() => {
    const watermark = document.querySelector('.table-watermark')
    const street = document.querySelector('.street-label')
    const sprite = document.querySelector('.pot-chip-art')
    const pot = document.querySelector('.pot-display')
    const label = pot?.querySelector('span')
    const value = pot?.querySelector('strong')
    const stack = document.querySelector('.pot-chips')
    const piles = [...(stack?.querySelectorAll('.chip-stack__pile') ?? [])].map((pile) => ({
      src: pile.querySelector('img')?.getAttribute('src') ?? '',
      drawn: pile.querySelectorAll('img').length,
      overflow: pile.querySelector('b')?.textContent ?? null,
    }))
    // Effective backdrop behind the pot panel: the felt, through the glass.
    const feltBg = getComputedStyle(document.querySelector('.table-felt')).backgroundColor
    return {
      watermark: Boolean(watermark),
      street: Boolean(street),
      sprite: Boolean(sprite),
      potText: value?.textContent?.trim() ?? '',
      labelColor: label ? getComputedStyle(label).color : '',
      valueColor: value ? getComputedStyle(value).color : '',
      panelBg: pot ? getComputedStyle(pot).backgroundColor : '',
      feltBg,
      piles,
      stackBox: stack ? stack.getBoundingClientRect().height : 0,
    }
  })

  /** Keeps the hand moving until a read comes back with a pot on the felt. */
  let felt = await readFelt()
  for (let attempt = 0; attempt < 80 && !felt.potText; attempt += 1) {
    const middle = page.locator('.action-button--call')
    if (await middle.count() && await middle.isEnabled().catch(() => false)) {
      await middle.click({ timeout: 2000 }).catch(() => {})
    }
    await page.waitForTimeout(260)
    felt = await readFelt()
  }
  if (!felt.potText) {
    problems.push(`[${theme}] no pot ever appeared on the felt`)
    await page.screenshot({ path: `${OUT}/${theme}-no-pot.png` })
  }
  await page.screenshot({ path: `${OUT}/${theme}-table.png` })
  await page.locator('.poker-table').screenshot({ path: `${OUT}/${theme}-felt.png` })

  if (felt.watermark) problems.push(`[${theme}] GH watermark is still on the felt`)
  if (felt.street) problems.push(`[${theme}] street label ("翻牌前") is still on the felt`)
  if (felt.sprite) problems.push(`[${theme}] old chip sprite is still on the felt`)

  // The panel is translucent, so contrast is measured against the felt behind it.
  const behind = felt.feltBg && felt.feltBg !== 'rgba(0, 0, 0, 0)' ? felt.feltBg : 'rgb(6, 69, 53)'
  for (const [what, color, floor] of [
    ['底池 label', felt.labelColor, 4.5],
    ['pot value', felt.valueColor, 3],
  ]) {
    if (!color) {
      problems.push(`[${theme}] ${what} has no colour — pot panel not found`)
      continue
    }
    const ratio = contrast(color, behind)
    if (ratio < floor) {
      problems.push(`[${theme}] ${what} ${ratio.toFixed(2)}:1 on the felt (needs ${floor}) — ${color}`)
    } else {
      console.log(`  ok [${theme}] ${what} ${ratio.toFixed(2)}:1 (${color})`)
    }
  }

  // Chips must add up to the pot they are drawn from.
  const pot = Number(felt.potText.replace(/[^\d]/g, ''))
  const DENOM = [5000, 1000, 500, 100, 25, 5, 1]
  let rest = pot
  const expected = []
  for (const value of DENOM) {
    const count = Math.floor(rest / value)
    if (count) { expected.push({ value, count }); rest -= count * value }
  }
  const drawn = felt.piles.map((pile) => ({
    value: Number(pile.src.match(/chip-(\d+)\.svg/)?.[1] ?? 0),
    count: pile.overflow ? Number(pile.overflow.replace(/[^\d]/g, '')) : pile.drawn,
  }))
  if (JSON.stringify(drawn) !== JSON.stringify(expected)) {
    problems.push(`[${theme}] pot ${pot} drawn as ${JSON.stringify(drawn)}, expected ${JSON.stringify(expected)}`)
  } else {
    console.log(`  ok [${theme}] pot ${pot} = ${drawn.map((d) => `${d.count}×${d.value}`).join(' + ')}`)
  }
  if (felt.potText && felt.stackBox < 8) {
    problems.push(`[${theme}] chip stack has no height (${felt.stackBox})`)
  }

  // ── 5. Rules and settings transitions ───────────────────────────────────
  await page.locator('.table-rail button[title="规则"]').click()
  const midRules = await sampleEnter(page, '.rules-view')
  await page.screenshot({ path: `${OUT}/${theme}-rules-enter.png` })
  if (midRules.missing) problems.push(`[${theme}] rules view never mounted`)
  else if (!isAnimating(midRules)) {
    problems.push(`[${theme}] rules entry did not animate (${JSON.stringify(midRules)})`)
  } else {
    console.log(`  ok [${theme}] rules enters animated (opacity ${midRules.opacity.toFixed(2)})`)
  }
  await page.waitForSelector('.rules-shell')
  await page.waitForTimeout(500)

  // Section swap inside rules.
  await page.locator('.rules-nav button').nth(2).click()
  await page.waitForTimeout(90)
  await page.screenshot({ path: `${OUT}/${theme}-rules-section.png` })
  await page.waitForTimeout(400)

  await page.locator('.rules-header .glass-button').click()
  await page.waitForTimeout(700)
  await page.locator('.table-rail button[title="设置"]').click()
  const midSettings = await sampleEnter(page, '.settings-view')
  await page.screenshot({ path: `${OUT}/${theme}-settings-enter.png` })
  if (midSettings.missing) problems.push(`[${theme}] settings view never mounted`)
  else if (!isAnimating(midSettings)) {
    problems.push(`[${theme}] settings entry did not animate (${JSON.stringify(midSettings)})`)
  } else {
    console.log(`  ok [${theme}] settings enters animated (opacity ${midSettings.opacity.toFixed(2)})`)
  }
  await page.waitForSelector('.settings-shell')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/${theme}-settings.png` })

  // Chip theme card should report the full denomination set as valid.
  const chipRow = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.asset-row')]
    const row = rows.find((r) => r.querySelector('.asset-row-copy > span')?.textContent?.includes('筹码'))
    return {
      status: row?.querySelector('.asset-row-copy p')?.textContent?.trim() ?? '',
      invalid: Boolean(row?.querySelector('.asset-row-copy p.invalid')),
      preview: row?.querySelector('.chip-preview')?.getAttribute('src') ?? '',
    }
  })
  if (chipRow.invalid) problems.push(`[${theme}] chip theme failed validation: ${chipRow.status}`)
  else console.log(`  ok [${theme}] chip theme: ${chipRow.status}`)
  await page.locator('.chip-preview').screenshot({ path: `${OUT}/${theme}-chip-preview.png` })

  for (const error of errors) problems.push(`[${theme}] console: ${error}`)
  await context.close()
}

await browser.close()

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exitCode = 1
} else {
  console.log('\nAll five fixes verified.')
}
