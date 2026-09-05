/**
 * FULL PLATFORM WALKTHROUGH — master recorder (v3, natural video pace).
 * Records the ENTIRE platform: public website (buyer/seller journey) + full
 * CRM (every module) as demo.owner of EZ Business Advisors, live site.
 *
 * Natural pacing: ~2.5-4.5s per view with slow scrolls — fast enough to watch,
 * long enough to read. No voice narration. One continuous video + chapters.
 */
import { chromium } from '/root/projects/concord-deal-platform/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = '/root/.openclaw/workspace/demo-deck/full-2026-09-04'
const RAW = `${OUT}/raw`
mkdirSync(RAW, { recursive: true })

const BASE = 'https://concorddeal.com'
const EMAIL = 'demo.owner@concordplatform.dev'
const PASSWORD = 'DemoOwner2026!'
const VIEWPORT = { width: 1440, height: 900 }
const t0 = Date.now()
const steps = []
const log = (x) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${x}`)
const hold = (p, ms) => p.waitForTimeout(ms)

async function slowScroll(page, totalPx, ticks = 5, dwell = 380) {
  const px = Math.max(60, Math.round(totalPx / ticks))
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, px).catch(() => {})
    await page.waitForTimeout(dwell)
  }
}

async function gotoView(page, url, label, opts = {}) {
  const { holdMs = 3200, scrollTo = 0 } = opts
  log(`→ ${url}`)
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await hold(page, 1400) // first paint
  if (scrollTo > 0) {
    await slowScroll(page, scrollTo)
    await hold(page, 900)
  }
  await hold(page, holdMs)
  steps.push({ url, label })
}

async function login(page) {
  await page.goto(BASE + '/auth', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await hold(page, 1500)
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL).catch(() => {})
  await page.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {})
  await page.getByRole('button', { name: /sign in|log in|continue/i }).first().click().catch(() => {})
  try {
    await page.waitForURL(/dashboard|pipeline|listings|leads/, { timeout: 30000 })
    log('login OK: ' + page.url())
  } catch {
    log('LOGIN WARN — landed on ' + page.url())
  }
  await hold(page, 2000)
}

const browser = await chromium.launch({ headless: true })

// ── WARM-UP (shared browser cache) ─────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const p = await ctx.newPage()
  await login(p).catch(() => log('warm login failed (non-fatal)'))
  const warm = [
    '/', '/marketplace/listings', '/valuation', '/dashboard/command-center',
    '/dashboard/listings', '/pipeline', '/leads', '/dashboard/studio',
    '/dashboard/calendar', '/dashboard/communications', '/dashboard/finance',
    '/dashboard/marketing', '/dashboard/newspaper', '/dashboard/settings',
  ]
  for (const u of warm) {
    await p.goto(BASE + u, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    await p.waitForTimeout(600)
  }
  await ctx.close()
  log('warm-up done')
}

// ── RECORDING PASS ─────────────────────────────────────────────────────────
const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', recordVideo: { dir: RAW, size: VIEWPORT } })
const page = await ctx.newPage()
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(60000)

try {
  // ══════════ PART 1 — PUBLIC WEBSITE (buyer + seller journey) ══════════
  await gotoView(page, '/', 'Home — hero', { holdMs: 4200 })
  await gotoView(page, '/', 'Home — scroll', { holdMs: 2500, scrollTo: 1400 })
  await gotoView(page, '/marketplace', 'Marketplace hub', { holdMs: 3500, scrollTo: 900 })
  await gotoView(page, '/marketplace/listings', 'All listings grid', { holdMs: 3800, scrollTo: 1200 })
  await gotoView(page, '/marketplace/listings/profitable-hvac-mechanical-services-company-harrisburg-pa-3ef86289', 'Listing detail — hero + financials', { holdMs: 4200 })
  await gotoView(page, '/marketplace/listings/profitable-hvac-mechanical-services-company-harrisburg-pa-3ef86289', 'Listing detail — NDA gate', { holdMs: 3000, scrollTo: 2200 })
  await gotoView(page, '/marketplace/buy', 'Buyer path', { holdMs: 3000, scrollTo: 800 })
  await gotoView(page, '/marketplace/sell', 'Seller path — list your business', { holdMs: 3500, scrollTo: 1200 })
  await gotoView(page, '/valuation', 'Instant Valuation', { holdMs: 3800, scrollTo: 900 })
  await gotoView(page, '/marketplace/franchise', 'Franchise channel', { holdMs: 3000, scrollTo: 700 })
  await gotoView(page, '/pricing', 'Pricing', { holdMs: 3000, scrollTo: 800 })
  await gotoView(page, '/marketplace/trust', 'Trust & verification', { holdMs: 2800, scrollTo: 700 })
  await gotoView(page, '/about', 'About', { holdMs: 2600, scrollTo: 700 })

  // ══════════ PART 2 — CRM: OVERVIEW ══════════
  await login(page)
  await gotoView(page, '/dashboard/command-center', 'Command Center — Today', { holdMs: 4200 })
  await gotoView(page, '/dashboard/command-center', 'Command Center — Analytics', { holdMs: 3800, scrollTo: 1000 })
  await gotoView(page, '/dashboard', 'Dashboard', { holdMs: 3200, scrollTo: 800 })
  await gotoView(page, '/dashboard/activity', 'Activity Feed', { holdMs: 3000, scrollTo: 700 })

  // ══════════ PART 3 — DEALS & LISTINGS ══════════
  await gotoView(page, '/pipeline', 'Deal Pipeline (kanban)', { holdMs: 4200, scrollTo: 700 })
  await gotoView(page, '/listings', 'Listings inventory', { holdMs: 4000, scrollTo: 1100 })
  await gotoView(page, '/dashboard/listings/new', 'New Listing wizard', { holdMs: 4200, scrollTo: 900 })
  await gotoView(page, '/dashboard/listings/3ef86289-82b2-4c61-9a2b-b1f817cdca03/edit', 'Listing edit — details', { holdMs: 3600, scrollTo: 1000 })
  await gotoView(page, '/dashboard/listings/3ef86289-82b2-4c61-9a2b-b1f817cdca03/workflow', 'Listing workflow', { holdMs: 3600, scrollTo: 800 })
  await gotoView(page, '/dashboard/studio', 'Deal Studio', { holdMs: 3400, scrollTo: 700 })
  await gotoView(page, '/leads', 'Lead Management', { holdMs: 3800, scrollTo: 900 })
  await gotoView(page, '/dashboard/deal-terms', 'Deal Terms', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/deal-docs', 'Deal Docs', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/closing', 'Closing Tracker', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/valuation', 'Valuation', { holdMs: 3200, scrollTo: 700 })
  await gotoView(page, '/dashboard/listing-advisor', 'Listing Advisor', { holdMs: 3400, scrollTo: 800 })
  await gotoView(page, '/dashboard/off-market', 'Off-Market Room', { holdMs: 3000, scrollTo: 600 })
  await gotoView(page, '/dashboard/expiry', 'Listing Expiry', { holdMs: 2800 })

  // ══════════ PART 4 — CLIENTS & DOCS ══════════
  await gotoView(page, '/dashboard/deal-room', 'Deal Room', { holdMs: 3400, scrollTo: 700 })
  await gotoView(page, '/dashboard/portal', 'Client Portal', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/network', 'Network', { holdMs: 3200, scrollTo: 700 })
  await gotoView(page, '/dashboard/search', 'Search', { holdMs: 3000, scrollTo: 500 })
  await gotoView(page, '/dashboard/reports', 'Reports & Diligence', { holdMs: 3200, scrollTo: 700 })
  await gotoView(page, '/dashboard/financial-files', 'Financial Files', { holdMs: 3000, scrollTo: 600 })

  // ══════════ PART 5 — MARKETING & GROWTH ══════════
  await gotoView(page, '/dashboard/marketing', 'Marketing hub', { holdMs: 3400, scrollTo: 800 })
  await gotoView(page, '/dashboard/store', 'Marketing Store', { holdMs: 3000, scrollTo: 600 })
  await gotoView(page, '/dashboard/store/orders', 'Store Orders', { holdMs: 2800 })
  await gotoView(page, '/dashboard/store/profits', 'Store Profits', { holdMs: 2800 })
  await gotoView(page, '/dashboard/newspaper', 'Newspaper', { holdMs: 3400, scrollTo: 700 })

  // ══════════ PART 6 — TEAM & OFFICE ══════════
  await gotoView(page, '/dashboard/calendar', 'Calendar', { holdMs: 3600, scrollTo: 500 })
  await gotoView(page, '/dashboard/communications', 'Communications', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/training', 'Training', { holdMs: 3000, scrollTo: 600 })
  await gotoView(page, '/dashboard/agents', 'AI Agents', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/dashboard/team', 'Team', { holdMs: 3200, scrollTo: 600 })

  // ══════════ PART 7 — AI AUTOPILOT ══════════
  await gotoView(page, '/dashboard/ai', 'Deal Autopilot', { holdMs: 4000, scrollTo: 900 })

  // ══════════ PART 8 — ADMIN ══════════
  await gotoView(page, '/dashboard/finance', 'Finance', { holdMs: 3200, scrollTo: 700 })
  await gotoView(page, '/dashboard/review-queue', 'Review Queue', { holdMs: 3000 })
  await gotoView(page, '/dashboard/approvals', 'Delivery Approvals', { holdMs: 3000 })
  await gotoView(page, '/dashboard/tools', 'CSV Tools', { holdMs: 2600 })
  await gotoView(page, '/dashboard/security', 'Security', { holdMs: 3000, scrollTo: 500 })
  await gotoView(page, '/agencies', 'Agency Admin', { holdMs: 3200, scrollTo: 600 })
  await gotoView(page, '/billing', 'Billing', { holdMs: 3000, scrollTo: 500 })
  await gotoView(page, '/dashboard/settings', 'Settings', { holdMs: 3200, scrollTo: 600 })

  log('ALL BEATS DONE — ' + steps.length + ' views')
} catch (err) {
  console.error('RUN FAILED:', err.message)
  process.exitCode = 1
} finally {
  await hold(page, 300).catch(() => {})
  const vpath = await page.video()?.path().catch(() => null)
  await ctx.close()
  await browser.close()
  log('video at: ' + (vpath || 'NONE'))
  writeFileSync(RAW + '/steps.json', JSON.stringify(steps, null, 1))
  console.log('__STEPS__' + JSON.stringify(steps.map((s, i) => ({ i, ...s }))))
}
