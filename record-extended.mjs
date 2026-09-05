/**
 * Extended chapters — full CRM + website coverage, human-like real usage.
 * Chapters 7-12 cover modules not deeply shown in 1-6.
 */
import { chromium } from '/root/projects/concord-deal-platform/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { VIEWPORT, makeLogger, login, gotoView, slowScroll, shot, clickHuman, clickButton } from './demo-lib.mjs'

const BASE = 'https://concorddeal.com'
const EMAIL = 'demo.owner@concordplatform.dev'
const PASSWORD = 'DemoOwner2026!'
const OUT = '/root/.openclaw/workspace/demo-deck/live-2026-09-04'
const args = process.argv.slice(2)
const ch = parseInt((args.find((a) => a.startsWith('--chapter=')) || '--chapter=7').split('=')[1], 10)
const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=dry').split('=')[1]
const t0 = Date.now()
const { log, steps } = makeLogger(t0)
mkdirSync(`${OUT}/ch${ch}-${mode}/shots`, { recursive: true })
const W = async (p, ms) => p.waitForTimeout(mode === 'dry' ? Math.min(ms, 220) : ms)
const S = (p, n) => (mode === 'real' ? shot(p, `${OUT}/ch${ch}-${mode}/shots`, n) : Promise.resolve())
async function safe(name, fn) { try { await fn(); log(`ok  ${name}`) } catch (e) { log(`!!  ${name} -> ${e.message.slice(0, 90)}`) } }

const chapters = {
  // CH7 — Buyer journey on the public marketplace (saved searches, compare, sold comps, pros)
  7: async (page) => {
    await gotoView(page, BASE, '/marketplace/listings', { wait: 1500 }); await slowScroll(page, 900); await S(page, '01-listings')
    await gotoView(page, BASE, '/marketplace/sold', { wait: 1300 }); await S(page, '02-sold')
    await gotoView(page, BASE, '/marketplace/comps', { wait: 1300 }); await S(page, '03-comps')
    await gotoView(page, BASE, '/marketplace/compare', { wait: 1300 }); await S(page, '04-compare')
    await gotoView(page, BASE, '/marketplace/insights', { wait: 1300 }); await S(page, '05-insights')
    await gotoView(page, BASE, '/marketplace/brokers', { wait: 1300 }); await S(page, '06-brokers')
    await gotoView(page, BASE, '/marketplace/guides/buyers', { wait: 1300 }); await S(page, '07-guide-buyers')
    await gotoView(page, BASE, '/marketplace/guides/sellers', { wait: 1300 }); await S(page, '08-guide-sellers')
    await gotoView(page, BASE, '/marketplace/financing', { wait: 1300 }); await S(page, '09-financing')
    await gotoView(page, BASE, '/marketplace/qualify', { wait: 1300 }); await S(page, '10-qualify')
    await gotoView(page, BASE, '/marketplace/alerts', { wait: 1300 }); await S(page, '11-alerts')
  },
  // CH8 — Deal room, docs, closing, valuation, reports (real actions)
  8: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/deal-room/0dbdc310-d3c6-4779-ad01-870ff56fa7f6', { wait: 1800 }); await slowScroll(page, 800); await S(page, '01-dealroom')
    await gotoView(page, BASE, '/dashboard/deal-terms', { wait: 1300 }); await S(page, '02-terms')
    await gotoView(page, BASE, '/dashboard/valuation', { wait: 1500 }); await S(page, '03-valuation')
    await gotoView(page, BASE, '/dashboard/listing-advisor', { wait: 1500 }); await slowScroll(page, 700); await S(page, '04-advisor')
    await gotoView(page, BASE, '/dashboard/reports', { wait: 1500 }); await S(page, '05-reports')
    await gotoView(page, BASE, '/dashboard/off-market', { wait: 1300 }); await S(page, '06-offmarket')
    await gotoView(page, BASE, '/dashboard/expiry', { wait: 1300 }); await S(page, '07-expiry')
    await gotoView(page, BASE, '/dashboard/portal', { wait: 1400 }); await S(page, '08-portal')
  },
  // CH9 — Marketing, newspaper, store + real content creation
  9: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/newspaper', { wait: 1600 }); await S(page, '01-newspaper')
    await safe('newspaper: create draft edition', async () => {
      await clickHuman(page, page.getByRole('button', { name: /new edition/i }))
      await W(page, 3500)
      await S(page, '02-new-edition')
    })
    await gotoView(page, BASE, '/dashboard/marketing', { wait: 1500 }); await S(page, '03-marketing')
    await safe('marketing: open social tab', async () => {
      await clickHuman(page, page.getByRole('button', { name: /social/i }))
      await W(page, 1000); await S(page, '04-social')
    })
    await gotoView(page, BASE, '/dashboard/store', { wait: 1500 }); await slowScroll(page, 700); await S(page, '05-store')
    await gotoView(page, BASE, '/dashboard/store/orders', { wait: 1200 }); await S(page, '06-orders')
    await gotoView(page, BASE, '/dashboard/store/profits', { wait: 1200 }); await S(page, '07-profits')
  },
  // CH10 — AI Autopilot, agents, training, finance, team, admin
  10: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/ai', { wait: 1800 }); await slowScroll(page, 900); await S(page, '01-autopilot')
    await gotoView(page, BASE, '/dashboard/agents', { wait: 1500 }); await S(page, '02-agents')
    await gotoView(page, BASE, '/dashboard/training', { wait: 1400 }); await S(page, '03-training')
    await gotoView(page, BASE, '/dashboard/finance', { wait: 1500 }); await S(page, '04-finance')
    await gotoView(page, BASE, '/dashboard/team', { wait: 1400 }); await S(page, '05-team')
    await gotoView(page, BASE, '/dashboard/review-queue', { wait: 1300 }); await S(page, '06-review')
    await gotoView(page, BASE, '/dashboard/approvals', { wait: 1300 }); await S(page, '07-approvals')
    await gotoView(page, BASE, '/dashboard/calendar', { wait: 1500 }); await S(page, '08-calendar')
    await gotoView(page, BASE, '/dashboard/communications', { wait: 1400 }); await S(page, '09-communications')
  },
  // CH11 — Admin: agencies, billing, security, settings, activity
  11: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/agencies', { wait: 1500 }); await S(page, '01-agencies')
    await gotoView(page, BASE, '/billing', { wait: 1400 }); await S(page, '02-billing')
    await gotoView(page, BASE, '/dashboard/security', { wait: 1300 }); await S(page, '03-security')
    await gotoView(page, BASE, '/dashboard/settings', { wait: 1400 }); await slowScroll(page, 600); await S(page, '04-settings')
    await gotoView(page, BASE, '/dashboard/activity', { wait: 1300 }); await S(page, '05-activity')
    await gotoView(page, BASE, '/dashboard/tools', { wait: 1200 }); await S(page, '06-tools')
    await gotoView(page, BASE, '/dashboard/search', { wait: 1300 }); await S(page, '07-search')
  },
  // CH12 — Profile + owner view + full listings detail browsing
  12: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/profile', { wait: 1400 }); await S(page, '01-profile')
    await gotoView(page, BASE, '/dashboard/owner', { wait: 1400 }); await S(page, '02-owner')
    await gotoView(page, BASE, '/dashboard/buyer', { wait: 1400 }); await S(page, '03-buyer-module')
    await gotoView(page, BASE, '/dashboard/certificates', { wait: 1300 }); await S(page, '04-certificates')
    await gotoView(page, BASE, '/dashboard/certified-brokers', { wait: 1300 }); await S(page, '05-certified')
    await gotoView(page, BASE, '/dashboard/onboarding', { wait: 1300 }); await S(page, '06-onboarding')
    await gotoView(page, BASE, '/dashboard/network', { wait: 1300 }); await S(page, '07-network')
  },
}

const browser = await chromium.launch({ headless: true })
const ctxOpts = mode === 'real'
  ? { viewport: VIEWPORT, locale: 'en-US', recordVideo: { dir: `${OUT}/ch${ch}-${mode}`, size: VIEWPORT } }
  : { viewport: VIEWPORT }
const ctx = await browser.newContext(ctxOpts)
const page = await ctx.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(50000)
log(`CHAPTER ${ch} — mode ${mode}`)
try { await chapters[ch](page) } catch (e) { console.error('CHAPTER FAILED:', e.message); process.exitCode = 1 }
finally {
  await W(page, 300)
  const vpath = mode === 'real' ? await page.video()?.path().catch(() => null) : null
  await ctx.close(); await browser.close()
  const fs = await import('node:fs')
  fs.writeFileSync(`${OUT}/ch${ch}-${mode}/steps.json`, JSON.stringify(steps, null, 1))
  console.log(`__DONE__ ch${ch} ${mode} video=${vpath}`)
}
