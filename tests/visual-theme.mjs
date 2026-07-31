/**
 * Light/dark theme + overlay check. Verifies the pairing sheet and the
 * confirmation dialog fit without scrolling, and captures both themes.
 *
 * Run: node tests/visual-theme.mjs   (needs `npm run preview` on :4173)
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT = 'test-results/theme'
const problems = []

const TARGETS = [
  { name: 'desktop', viewport: { width: 1600, height: 900 } },
  { name: 'laptop-short', viewport: { width: 1280, height: 680 } },
  { name: 'phone-landscape', viewport: { width: 852, height: 393 } },
]

/**
 * Two separate failures to catch, and `scrollHeight` conflates them:
 *  - a real scrollbar (the thing the user sees), and
 *  - real content clipped out of view.
 * `scrollHeight` also counts absolutely-positioned decoration that is clipped on
 * purpose, so it reports overflow on panels that are visually perfect. Measure
 * the scrollbar directly, and compare in-flow children against the content box.
 */
async function checkNoScroll(page, label, selectors) {
  const found = await page.evaluate((list) => {
    const out = []
    for (const selector of list) {
      for (const el of document.querySelectorAll(selector)) {
        const style = getComputedStyle(el)
        const scrollable = ['auto', 'scroll'].includes(style.overflowY)
        if (scrollable && el.scrollHeight > el.clientHeight + 2) {
          out.push(`${selector} shows a vertical scrollbar (${el.scrollHeight} > ${el.clientHeight})`)
        }
        if (['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 2) {
          out.push(`${selector} shows a horizontal scrollbar`)
        }
        // Real, laid-out content must sit inside the padding box.
        const box = el.getBoundingClientRect()
        const padTop = parseFloat(style.paddingTop)
        const padBottom = parseFloat(style.paddingBottom)
        for (const kid of el.children) {
          if (getComputedStyle(kid).position === 'absolute') continue
          const kidBox = kid.getBoundingClientRect()
          if (kidBox.height === 0) continue
          if (kidBox.bottom > box.bottom - padBottom + 2) {
            out.push(`${selector} clips ${kid.tagName.toLowerCase()}.${kid.className.toString().split(' ')[0]} (bottom ${Math.round(kidBox.bottom)} > ${Math.round(box.bottom - padBottom)})`)
          }
          if (kidBox.top < box.top + padTop - 2) {
            out.push(`${selector} clips ${kid.tagName.toLowerCase()} at the top`)
          }
        }
      }
    }
    return out
  }, selectors)
  for (const item of found) problems.push(`[${label}] ${item}`)
}

/** Text must stay legible against whatever the theme puts behind it. */
async function checkContrast(page, label) {
  const findings = await page.evaluate(() => {
    const parse = (value) => {
      const nums = value.match(/[\d.]+/g)?.map(Number) ?? []
      return { r: nums[0] ?? 0, g: nums[1] ?? 0, b: nums[2] ?? 0, a: nums[3] ?? 1 }
    }
    const lum = ({ r, g, b }) => {
      const f = (c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    /** Walks up for the first opaque-enough background behind an element. */
    const backdrop = (el) => {
      let node = el
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor)
        if (bg.a > 0.55) return bg
        node = node.parentElement
      }
      return parse(getComputedStyle(document.body).backgroundColor)
    }
    const out = []
    const seen = new Set()
    for (const el of document.querySelectorAll('h1, h2, strong, label > span, p, button, small')) {
      const text = el.textContent?.trim()
      if (!text || el.offsetWidth === 0 || el.children.length > 0) continue
      const style = getComputedStyle(el)
      const fg = parse(style.color)
      if (fg.a < 0.5) continue
      const bg = backdrop(el)
      const l1 = lum(fg)
      const l2 = lum(bg)
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const size = parseFloat(style.fontSize)
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700)
      const floor = large ? 3 : 4.5
      const key = `${text.slice(0, 20)}|${style.color}`
      if (ratio < floor && !seen.has(key)) {
        seen.add(key)
        out.push(`"${text.slice(0, 26)}" ${ratio.toFixed(2)}:1 (needs ${floor}) ${style.color}`)
      }
    }
    return out.slice(0, 12)
  })
  for (const item of findings) problems.push(`[${label}] contrast: ${item}`)
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

for (const theme of ['light', 'dark']) {
  for (const target of TARGETS) {
    const context = await browser.newContext({ viewport: target.viewport })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await page.addInitScript((mode) => {
      localStorage.setItem('glass-holdem.settings.v1', JSON.stringify({ colorMode: mode }))
      // Seed a saved room so the resume banner and its disconnect button render.
      localStorage.setItem('glass-holdem.session.v1', JSON.stringify({
        role: 'guest',
        roomName: '周五牌局',
        roomCode: '8K2F7M',
        savedAt: Date.now() - 60_000,
      }))
    }, theme)
    await page.goto(BASE, { waitUntil: 'networkidle' })

    const label = `${theme}/${target.name}`
    if (!(await page.locator('.resume-banner').count())) {
      problems.push(`[${label}] saved room did not offer a resume banner`)
    }
    if (!(await page.locator('.resume-banner__drop').count())) {
      problems.push(`[${label}] resume banner has no disconnect button`)
    }
    await checkNoScroll(page, `${label} resume`, ['.resume-banner'])
    const resolved = await page.evaluate(() => document.documentElement.dataset.theme)
    if (resolved !== theme) problems.push(`[${label}] data-theme is "${resolved}", expected "${theme}"`)

    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-lobby.png` })
    await checkContrast(page, `${label} lobby`)

    // Create a room: this is the pairing sheet that must not scroll.
    await page.getByRole('button', { name: /创建离线牌局/ }).click()
    await page.waitForSelector('.pairing-sheet', { timeout: 15000 })
    await page.waitForTimeout(2200)
    await checkNoScroll(page, `${label} pairing`, ['.pairing-sheet', '.pairing-code-layout'])
    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-pairing.png` })

    // A scrim tap must NOT dismiss it any more.
    await page.mouse.click(6, 6)
    await page.waitForTimeout(250)
    if (!(await page.locator('.pairing-sheet').count())) {
      problems.push(`[${label}] scrim tap still closes the pairing sheet`)
    }
    await page.locator('.pairing-header > button').click()
    await page.waitForTimeout(320)

    // Table: the rail must be top-right, and leaving must ask first.
    await page.waitForSelector('.table-rail', { timeout: 5000 })
    const railBox = await page.locator('.table-rail').boundingBox()
    if (railBox && railBox.x + railBox.width < target.viewport.width * 0.6) {
      problems.push(`[${label}] .table-rail is not in the right half (x=${Math.round(railBox.x)})`)
    }
    if (railBox && railBox.y > target.viewport.height * 0.3) {
      problems.push(`[${label}] .table-rail is not near the top (y=${Math.round(railBox.y)})`)
    }
    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-table.png` })

    await page.locator('.table-rail button[title="离开牌桌"]').click()
    await page.waitForTimeout(320)
    if (!(await page.locator('.confirm-sheet').count())) {
      problems.push(`[${label}] leaving the table did not ask for confirmation`)
    }
    await checkNoScroll(page, `${label} confirm`, ['.confirm-sheet'])
    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-confirm.png` })
    await page.locator('.confirm-actions .primary-action').click()
    await page.waitForTimeout(320)

    // Settings: the theme picker lives here, and the rules page shares its chrome.
    await page.locator('.header-actions button').nth(1).click()
    await page.waitForSelector('.settings-shell')
    await page.locator('.settings-sidebar nav button').nth(1).click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-settings.png` })
    await checkContrast(page, `${label} settings`)

    const picked = await page.locator('.mode-segment button.active').textContent()
    const expected = { light: '明亮', dark: '深色' }[theme]
    if (!picked?.includes(expected)) {
      problems.push(`[${label}] theme picker shows "${picked?.trim()}", expected ${expected}`)
    }

    await page.locator('.settings-header .glass-button').click()
    await page.waitForTimeout(250)
    await page.locator('.header-actions button').first().click()
    await page.waitForSelector('.rules-shell')
    await page.screenshot({ path: `${OUT}/${theme}-${target.name}-rules.png` })
    await checkContrast(page, `${label} rules`)

    for (const error of errors) problems.push(`[${label}] console: ${error}`)
    await context.close()
  }
}

await browser.close()

if (problems.length) {
  console.log(`${problems.length} problem(s):`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('Theme, overlay and layout checks passed.')
}
