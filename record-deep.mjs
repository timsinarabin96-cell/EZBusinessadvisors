/**
 * Deep-dive chapters — human work-session takes: click INTO records, use
 * search, view deal detail, listing workflow, lead profile. Slower dwell.
 */
import { chromium } from '/root/projects/concord-deal-platform/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { VIEWPORT, makeLogger, login, gotoView, slowScroll, shot, clickHuman } from './demo-lib.mjs'

const BASE = 'https://concorddeal.com'
const EMAIL = 'demo.owner@concordplatform.dev'
const PASSWORD = 'DemoOwner2026!'
const OUT = '/root/.openclaw/workspace/demo-deck/live-2026-09-04'
const args = process.argv.slice(2)
const ch = parseInt((args.find((a) => a.startsWith('--chapter=')) || '--chapter=1').split('=')[1], 10)
const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=dry').split('=')[1]
const t0 = Date.now()
const { log, steps } = makeLogger(t0)
mkdirSync(`${OUT}/deep${ch}-${mode}/shots`, { recursive: true })
const W = async (p, ms) => p.waitForTimeout(mode === 'dry' ? Math.min(ms, 200) : ms)
const S = (p, n) => (mode === 'real' ? shot(p, `${OUT}/deep${ch}-${mode}/shots`, n) : Promise.resolve())
async function safe(name, fn) { try { await fn(); log(`ok  ${name}`) } catch (e) { log(`!!  ${name} -> ${e.message.slice(0, 90)}`) } }

const chapters = {
  // D1 — Command Center deep dive: Today / Performance / Analytics with long looks
  1: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/command-center', { wait: 2500 })
    await S(page, '01-cc-today'); await slowScroll(page, 900); await W(page, 2600)
    await safe('tab performance', async () => { await clickHuman(page, page.getByRole('button', { name: /performance/i })); await W(page, 2600); await slowScroll(page, 900); await S(page, '02-cc-performance') })
    await safe('tab analytics', async () => { await clickHuman(page, page.getByRole('button', { name: /analytics/i })); await W(page, 3000); await slowScroll(page, 1100); await S(page, '03-cc-analytics') })
  },
  // D2 — Listings deep dive: inventory → open workflow of the HVAC deal → edit view
  2: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/listings', { wait: 2200 }); await slowScroll(page, 1000); await S(page, '01-inventory')
    await safe('open listing workflow', async () => {
      const link = page.locator('a[href*="/dashboard/listings/"], a[href*="workflow"]').first()
      await clickHuman(page, link)
      await W(page, 3000); await S(page, '02-workflow'); await slowScroll(page, 900); await W(page, 1500)
    })
    await gotoView(page, BASE, '/dashboard/studio', { wait: 2200 }); await slowScroll(page, 800); await S(page, '03-studio')
  },
  // D3 — Pipeline deep dive + buyer funnel
  3: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/pipeline', { wait: 2500 }); await S(page, '01-pipeline')
    await safe('buyer funnel tab', async () => { await clickHuman(page, page.getByRole('button', { name: /buyer funnel/i })); await W(page, 2500); await slowScroll(page, 800); await S(page, '02-funnel') })
    await safe('open first deal card', async () => {
      const card = page.locator('a[href*="/deal"], [role="button"]:has-text("Keystone HVAC")').first()
      await clickHuman(page, card)
      await W(page, 2800); await S(page, '03-deal-open')
    })
  },
  // D4 — Leads deep dive: open lead profiles, tabs
  4: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/leads', { wait: 2200 }); await S(page, '01-leads')
    await safe('open a buyer profile', async () => {
      const prof = page.locator('button:has-text("Profile"), a[href*="profile"], [role="button"]:has-text("Andrew Cole")').first()
      await clickHuman(page, prof)
      await W(page, 2500); await S(page, '02-buyer-profile')
    })
    await safe('send NDA area', async () => {
      const nda = page.getByRole('button', { name: /send nda/i }).first()
      await clickHuman(page, nda)
      await W(page, 2000); await S(page, '03-nda')
      await page.keyboard.press('Escape').catch(() => {}); await W(page, 400)
    })
  },
}

const browser = await chromium.launch({ headless: true })
const ctxOpts = mode === 'real'
  ? { viewport: VIEWPORT, locale: 'en-US', recordVideo: { dir: `${OUT}/deep${ch}-${mode}`, size: VIEWPORT } }
  : { viewport: VIEWPORT }
const ctx = await browser.newContext(ctxOpts)
const page = await ctx.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(50000)
log(`DEEP CHAPTER ${ch} — ${mode}`)
try { await chapters[ch](page) } catch (e) { console.error('FAILED:', e.message); process.exitCode = 1 }
finally {
  await W(page, 300)
  const vpath = mode === 'real' ? await page.video()?.path().catch(() => null) : null
  await ctx.close(); await browser.close()
  console.log(`__DONE__ deep${ch} ${mode} video=${vpath}`)
}
