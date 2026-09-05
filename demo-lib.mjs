/**
 * Human-like interactive demo library — drives the live site as a real operator:
 * types with natural per-char delays, scrolls smoothly, clicks, screenshots.
 */
import { mkdirSync, writeFileSync } from 'node:fs'

export const VIEWPORT = { width: 1440, height: 900 }

export function makeLogger(t0) {
  const steps = []
  const log = (x) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${x}`)
  return {
    steps,
    log,
    mark(name) { steps.push({ name, sec: (Date.now() - t0) / 1000 }); log(`MARK ${name}`) },
  }
}

export async function login(page, BASE, email, password) {
  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1600)
  await page.locator('input[type="email"], input[name="email"]').first().fill(email).catch(() => {})
  await page.locator('input[type="password"]').first().fill(password).catch(() => {})
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click().catch(() => {})
  try { await page.waitForURL(/dashboard|pipeline|listings|leads|command-center/, { timeout: 30000 }); } catch {}
  await page.waitForTimeout(2200)
  return page.url()
}

/** Human-ish typing: focus, then per-char delay. */
export async function typeHuman(page, locator, text, cps = 26) {
  const el = locator.first()
  await el.click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(250)
  const delay = Math.round(1000 / cps)
  for (const ch of text) {
    await el.pressSequentially ? null : null
    await page.keyboard.type(ch, { delay })
  }
}

export async function clickHuman(page, locator) {
  const el = locator.first()
  await el.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(220)
  await el.click({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(500)
}

export async function gotoView(page, BASE, url, opts = {}) {
  const { wait = 2400 } = opts
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(wait)
}

export async function slowScroll(page, totalPx, ticks = 5, dwell = 340) {
  const px = Math.max(50, Math.round(totalPx / ticks))
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, px).catch(() => {})
    await page.waitForTimeout(dwell)
  }
}

export async function shot(page, dir, name) {
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: `${dir}/${name}.png` }).catch(() => {})
}

/** Fill a labelled field inside the listing wizard: label text -> value.
 * Uses the React-native value setter + input event (reliable for controlled
 * inputs like MoneyInput which format as you type). */
export async function wizardField(page, label, value, { area = 'main', human = false } = {}) {
  const scopeSel = area === 'main' ? 'main' : area
  if (human) {
    // human-like: focus the real input and type with per-char delay (visible on video)
    const field = page
      .locator(`main label:has(span.label:text-is("${label}")) input, main label:has(span.label:text-is("${label}")) textarea, main label:has(span.label:text-is("${label}")) select`)
      .first()
    for (let i = 0; i < 12; i++) {
      if (await field.count().catch(() => 0)) break
      await page.waitForTimeout(400)
    }
    if (!(await field.count().catch(() => 0))) return wizardField(page, label, value, { area })
    const tag = await field.evaluate((el) => el.tagName).catch(() => '')
    if (tag === 'SELECT') {
      await field.selectOption({ label: String(value) }).catch(async () => {
        await field.selectOption({ index: 1 }).catch(() => {})
      })
      await page.waitForTimeout(300)
      return true
    }
    await field.scrollIntoViewIfNeeded().catch(() => {})
    await field.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(250)
    await field.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a').catch(() => {})
    const delay = 24
    for (const ch of String(value)) await page.keyboard.type(ch, { delay })
    await page.waitForTimeout(350)
    return true
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const ok = await page.evaluate(
      ({ scopeSel, label, value }) => {
        const roots = document.querySelectorAll(scopeSel)
        let inp = null
        for (const root of roots) {
          const ls = [...root.querySelectorAll('label span.label')].filter((s) => s.textContent.trim() === label)
          if (!ls.length) continue
          inp = ls[0].closest('label')?.querySelector('input, textarea, select')
          if (inp) break
        }
        if (!inp) return 'NOTFOUND'
        if (inp.tagName === 'SELECT') {
          // pick the option whose text starts with our value (or the first real option)
          const opts = [...inp.querySelectorAll('option')]
          const target =
            opts.find((o) => o.textContent.toLowerCase().includes(String(value).toLowerCase())) ||
            opts.find((o) => o.value && o.value !== 'all' && !o.disabled)
          if (!target) return 'NOTFOUND'
          const s2 = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          s2.call(inp, target.value)
          inp.dispatchEvent(new Event('change', { bubbles: true }))
          return 'SET'
        }
        const proto = inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
        setter.call(inp, String(value))
        inp.dispatchEvent(new Event('input', { bubbles: true }))
        inp.dispatchEvent(new Event('change', { bubbles: true }))
        return 'SET'
      },
      { scopeSel, label, value },
    )
    if (ok === 'SET') {
      await page.waitForTimeout(260)
      return true
    }
    await page.waitForTimeout(300) // React async re-render may be in flight
  }
  console.log(`  !! field not found after retries: ${label}`)
  try {
    const diag = await page.evaluate(() => ({
      h2: [...document.querySelectorAll('h2')].map((x) => x.textContent.trim()).slice(0, 3),
      labels: [...document.querySelectorAll('main label span.label')].map((s) => s.textContent.trim()).slice(0, 16),
    }))
    console.log('    diag:', JSON.stringify(diag))
  } catch {}
  return false
}

/** Navigate between wizard sections via the always-visible sidebar. */
export async function wizardNav(page, sectionLabel) {
  const ok = await page.evaluate((s) => {
    const btn = [...document.querySelectorAll('aside button')].find((x) => (x.textContent || '').includes(s) && x.offsetParent)
    if (!btn) return false
    btn.click()
    return true
  }, sectionLabel)
  await page.waitForTimeout(1600)
  if (!ok) console.log(`  !! section nav not found: ${sectionLabel}`)
  return ok
}

export async function clickButton(page, nameRe, { exact = false } = {}) {
  const b = exact
    ? page.getByRole('button', { name: nameRe, exact: true })
    : page.getByRole('button', { name: nameRe })
  try {
    await b.first().click({ timeout: 9000 })
    await page.waitForTimeout(700)
    return true
  } catch { return false }
}

export function writeSteps(file, steps) {
  writeFileSync(file, JSON.stringify(steps, null, 1))
}
