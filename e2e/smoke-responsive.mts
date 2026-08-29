import { chromium } from 'playwright'

// =============================================================================
// Human-like smoke test: desktop + mobile, console errors, broken layout
// signals (horizontal scroll, overlapping nav, missing content).
// =============================================================================

const BASE = process.env.BASE_URL || 'https://concord-deal-platform.vercel.app'
const PAGES = ['/', '/marketplace/listings', '/pricing', '/auth', '/auth/signup', '/marketplace/sell', '/about']

async function checkPage(page, url, label) {
  const errors = []
  const logs = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
  const resp = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => null)
  await page.waitForTimeout(1200)
  const status = resp ? resp.status() : 'FAILED'
  const title = await page.title().catch(() => '')
  const bodyText = await page.evaluate(() => document.body ? document.body.innerText.length : 0).catch(() => 0)
  // Horizontal overflow = layout broken (mobile especially)
  const overflow = await page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth - de.clientWidth
  }).catch(() => 0)
  // Visible "broken" markers
  const errText = await page.evaluate(() => {
    const t = (document.body?.innerText || '').toLowerCase()
    const markers = ['application error', 'something went wrong', 'internal server error', 'failed to load', 'unhandled', 'null is not an object', 'cannot read properties']
    return markers.filter((m) => t.includes(m))
  }).catch(() => [])
  console.log(`${label} | ${url} | HTTP ${status} | title="${title.slice(0, 40)}" | bodyChars=${bodyText} | hOverflow=${overflow}px | brokenMarkers=${errText.join(',') || 'none'} | jsErrors=${errors.length}`)
  if (errors.length) console.log('   JS ERRORS:', errors.slice(0, 3).join(' | '))
  return { status, errors, overflow, errText }
}

const browser = await chromium.launch()
// Desktop
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const dpage = await desktop.newPage()
console.log('=== DESKTOP 1440px ===')
for (const p of PAGES) await checkPage(dpage, p, 'DESK')
// Mobile
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
const mpage = await mobile.newPage()
console.log('=== MOBILE 390px ===')
for (const p of PAGES) await checkPage(mpage, p, 'MOB')
await browser.close()
console.log('DONE')
