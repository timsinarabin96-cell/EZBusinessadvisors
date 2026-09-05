/**
 * INTERACTIVE FULL-DEMO RECORDER — human-like real usage of the live platform.
 * Chapter scripts; DRY=1 fast validation (no video), REAL=1 full recording.
 * Usage: node record-interactive.mjs --chapter=3 --mode=dry|real
 */
import { chromium } from '/root/projects/concord-deal-platform/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import {
  VIEWPORT, makeLogger, login, typeHuman, clickHuman, gotoView, slowScroll, shot, wizardField, wizardNav, clickButton,
} from './demo-lib.mjs'

const BASE = 'https://concorddeal.com'
const EMAIL = 'demo.owner@concordplatform.dev'
const PASSWORD = 'DemoOwner2026!'
const OUT = '/root/.openclaw/workspace/demo-deck/live-2026-09-04'
const args = process.argv.slice(2)
const ch = parseInt((args.find((a) => a.startsWith('--chapter=')) || '--chapter=1').split('=')[1], 10)
const mode = (args.find((a) => a.startsWith('--mode=')) || '--mode=dry').split('=')[1]
const t0 = Date.now()
const { log, mark, steps } = makeLogger(t0)
mkdirSync(`${OUT}/ch${ch}-${mode}/shots`, { recursive: true })

const W = async (p, ms) => p.waitForTimeout(process.env.FULLWAIT ? ms : mode === 'dry' ? Math.min(ms, 260) : ms)
const S = (p, n) => (mode === 'real' ? shot(p, `${OUT}/ch${ch}-${mode}/shots`, n) : Promise.resolve())

// safe wrapper — one hiccup never kills the take
async function safe(name, fn) {
  try { await fn(); log(`ok  ${name}`) }
  catch (e) { log(`!!  ${name} -> ${e.message.slice(0, 90)}`) }
}



// wait for the section heading to actually appear (autosave remounts the form)
async function waitSection(page, sectionBtn) {
  const want = {"Business":"Business identity","Financials":"Financial profile","Operations":"Operating intelligence","Seller & Deal":"Seller and transaction","Photos & Video":"Photos & Video","Public Preview":"Seller-approved public preview"}[sectionBtn] || ''
  for (let i = 0; i < 15; i++) {
    const h2s = await page.evaluate(() => [...document.querySelectorAll('main h2, section h2')].map((x) => x.textContent.trim()))
    if (want && h2s.some((h) => h.includes(want))) return true
    await wizardNav(page, sectionBtn)
    await page.waitForTimeout(700)
  }
  log('!! section never mounted: ' + sectionBtn)
  return false
}

// wait for the section heading to actually appear (autosave remounts the form)
const SECTION_H2 = {
  Business: 'Business identity',
  Financials: 'Financial profile',
  Operations: 'Operating intelligence',
  'Seller & Deal': 'Seller and transaction',
  'Photos & Video': 'Photos & Video',
  'Public Preview': 'Seller-approved public preview',
}

// fill every field in a section, re-navigating if autosave resets the wizard
async function fillSection(page, sectionBtn, fields, shotName) {
  for (let pass = 0; pass < 4; pass++) {
    if (!(await waitSection(page, sectionBtn))) break
    // settle any pending autosave from previous section before typing here
    await page.waitForTimeout(1400)
    let allOk = true
    for (const [lbl, val, human] of fields) {
      let done = await wizardField(page, lbl, val, { human: !!human })
      // close any autocomplete dropdown so frames stay clean
      await page.keyboard.press('Escape').catch(() => {})
      await page.evaluate(() => { const el = document.activeElement; if (el && typeof el.blur === 'function') el.blur() }).catch(() => {})
      await page.waitForTimeout(250)
      if (!done) {
        await page.waitForTimeout(700)
        const onTarget = await page.evaluate((want) => [...document.querySelectorAll('main h2, section h2')].some((x) => x.textContent.includes(want)), SECTION_H2[sectionBtn] || '')
        if (onTarget) done = await wizardField(page, lbl, val)
        if (!done) { allOk = false; log('!! giving up on ' + lbl) }
      }
    }
    if (allOk) break
    await page.waitForTimeout(1200) // autosave remount window
  }
  await page.waitForTimeout(3200) // let autosave finish before moving on
  await S(page, shotName)
}


// ─────────────────────────────────────────────────────────────────────────────
const chapters = {
  // CH1 — Public website, buyer + seller journeys
  1: async (page) => {
    await gotoView(page, BASE, '/', { wait: 1500 }); await S(page, '01-home')
    await slowScroll(page, 1400); await W(page, 1800); await S(page, '02-home-scroll')
    await gotoView(page, BASE, '/marketplace', { wait: 1200 }); await slowScroll(page, 900); await S(page, '03-marketplace')
    await gotoView(page, BASE, '/marketplace/listings', { wait: 1500 }); await slowScroll(page, 1300); await S(page, '04-listings')
    await gotoView(page, BASE, '/marketplace/listings/profitable-hvac-mechanical-services-company-harrisburg-pa-3ef86289', { wait: 1800 })
    await slowScroll(page, 900); await S(page, '05-detail')
    await safe('NDA modal open/close', async () => {
      await clickHuman(page, page.getByRole('button', { name: /request confidential|request pricing|unlock/i }))
      await W(page, 900); await S(page, '06-nda-modal')
      await page.keyboard.press('Escape'); await W(page, 400)
    })
    await gotoView(page, BASE, '/marketplace/buy', { wait: 900 }); await S(page, '07-buy')
    await gotoView(page, BASE, '/marketplace/sell', { wait: 1200 }); await slowScroll(page, 900); await S(page, '08-sell')
    await gotoView(page, BASE, '/valuation', { wait: 1200 }); await S(page, '09-valuation')
    await safe('type valuation demo (no submit)', async () => {
      const inputs = page.locator('main input, main textarea')
      const n = await inputs.count()
      for (let i = 0; i < Math.min(n, 8); i++) {
        const el = inputs.nth(i)
        const ph = await el.getAttribute('placeholder').catch(() => '')
        const visible = await el.isVisible().catch(() => false)
        if (!visible || ph === 'Search listings, deals, leads, documents…') continue
        const vals = ['Demo Seller', 'demo@example.com', '(717) 555-0100', 'Demo Roofing Co.', 'Roofing', '$1M – $2M', '6-12 months', 'Demo walkthrough — safe to delete']
        const idx = [...Array(n).keys()].findIndex((k) => k === i)
        await el.fill(vals[idx % vals.length]).catch(() => {})
        await W(page, 150)
      }
      await S(page, '10-valuation-filled')
    })
    await gotoView(page, BASE, '/marketplace/franchise', { wait: 800 }); await S(page, '11-franchise')
    await gotoView(page, BASE, '/pricing', { wait: 800 }); await S(page, '12-pricing')
    await gotoView(page, BASE, '/about', { wait: 700 }); await S(page, '13-about')
  },

  // CH2 — Login + Command Center + dashboard
  2: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await S(page, '01-logged-in')
    await gotoView(page, BASE, '/dashboard/command-center', { wait: 2000 }); await S(page, '02-command-center')
    await slowScroll(page, 800); await W(page, 900)
    await safe('switch to Analytics tab', async () => {
      await clickHuman(page, page.getByRole('button', { name: /analytics/i }))
      await W(page, 2200); await S(page, '03-analytics')
    })
    await gotoView(page, BASE, '/dashboard', { wait: 1800 }); await slowScroll(page, 900); await S(page, '04-dashboard')
    await gotoView(page, BASE, '/dashboard/activity', { wait: 1200 }); await S(page, '05-activity')
  },

  // CH3 — ★ Create a listing manually, field by field (the centerpiece)
  3: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/listings', { wait: 1600 }); await slowScroll(page, 800); await S(page, '01-inventory')
    await gotoView(page, BASE, '/dashboard/listings/new', { wait: 2000 }); await S(page, '02-wizard')
    await safe('switch to Manual Entry', async () => {
      await clickHuman(page, page.getByRole('button', { name: /manual entry/i }))
      await W(page, 1600); await S(page, '03-manual-entry')
    })
    // SECTION 1 — Business
    await fillSection(page, 'Business', [
      ['Legal or operating business name *', 'Susquehanna Valley Dental Laboratory', true],
      ['Internal marketing headline', 'Established dental lab with loyal client base', true],
      ['Year established', '2013'],
      ['Primary industry', 'Healthcare'],
      ['Sub-industry', 'Dental lab'],
      ['General market area', 'Harrisburg, PA', true],
      ['Complete confidential description', 'Family-owned dental laboratory serving central Pennsylvania dentists for nearly three decades. Recurring crown, bridge, and implant work; trained technician team; fully equipped lab under lease. Owner is retiring after an orderly career and wants continuity for staff and referring clients.', true],
    ], '04-section-business')

    // SECTION 2 — Financials
    await fillSection(page, 'Financials', [
      ['Asking price', '495000'],
      ['Annual revenue', '680000'],
      ['Seller discretionary earnings', '214000'],
      ['EBITDA', '198000'],
      ['Inventory value', '18000'],
      ['Furniture, fixtures & equipment', '175000'],
      ['Monthly lease', '5200'],
      ['Lease expiration', '2030-12-31'],
      ['Financing structure and qualification notes', 'Clean SBA story — seller owns real estate separately and will lease; no environmental concerns.'],
    ], '06-financials-filled')

    // SECTION 3 — Operations
    await fillSection(page, 'Operations', [
      ['Full-time employees', '9'],
      ['Part-time employees', '4'],
      ['Owner hours per week', '45'],
      ['Customer concentration', 'Largest client under 12% of revenue'],
      ['Competitive advantages', '30+ referring dentists; digital scanners; 10-year lab director stays on'],
      ['Growth opportunities', 'Implant restorations and same-day digital workflow under-served in region'],
      ['Facilities and operating footprint', '2,400 sq ft leased lab, fully equipped, central PA location'],
      ['Years at current location', '12'],
      ['Pending litigation', 'None'],
      ['Environmental issues', 'None'],
      ['Key customer contracts', 'No formal contracts — repeat referral relationships'],
    ], '08-operations-filled')

    // SECTION 4 — Seller & deal
    await fillSection(page, 'Seller & Deal', [
      ['Reason for sale', 'Owner retiring after 30 years in dentistry — wants continuity for staff and clients'],
      ['Transition support', 'Owner available 90 days; lab director 24 months'],
      ['Training period (weeks)', '12'],
    ], '10-transition-filled')

    // SECTION 5 — Media (photo prompt only — no AI provider configured)
    await fillSection(page, 'Photos & Video', [], '11-media')
    await safe('photo prompt', async () => {
      for (let i = 0; i < 5; i++) {
        const done = await page.evaluate(() => {
          const ta = [...document.querySelectorAll('main textarea')].find((x) => (x.placeholder || '').includes('photo you want'))
          if (!ta) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, 'Modern dental laboratory workstations with technicians at digital scanners')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })
        if (done) break
        await page.waitForTimeout(600)
      }
    })
    await S(page, '12-media-filled')

    // SECTION 6 — Public preview
    await fillSection(page, 'Public Preview', [
      ['Anonymous public title', 'Established Dental Laboratory — Central PA', true],
      ['Public summary', 'Profitable dental laboratory with loyal referring dentists, trained team, and modern digital equipment. Ideal for an owner-operator or strategic buyer.', true],
      ['Public highlights — one per line', '10+ years of recurring lab work\nTrained technician team stays on\nDigital scanners & modern equipment\nOwner transition support included'],
    ], '14-public-filled')
    await safe('submit draft', async () => {
      const ok = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /create draft & start review|ready — advance to verify|advance to verify/i.test(x.textContent) && x.offsetParent)
        if (!b) return false
        b.click(); return true
      })
      await W(page, 4500)
      await S(page, '15-after-submit')
      if (!ok) log('!! submit button not found')
    })
    await gotoView(page, BASE, '/listings', { wait: 1800 }); await slowScroll(page, 700); await S(page, '16-inventory-after')
  },

  // CH4 — Pipeline, leads, review queue
  4: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/pipeline', { wait: 2200 }); await slowScroll(page, 800); await S(page, '01-pipeline')
    await gotoView(page, BASE, '/leads', { wait: 1800 }); await S(page, '02-leads')
    await safe('buyers tab', async () => { await clickHuman(page, page.getByRole('button', { name: /^👤 Buyers$/i })); await W(page, 1200); await S(page, '03-buyers') })
    await safe('sellers tab', async () => { await clickHuman(page, page.getByRole('button', { name: /sellers/i })); await W(page, 1200); await S(page, '04-sellers') })
    await safe('Add Lead (open, fill, cancel)', async () => {
      await clickHuman(page, page.getByRole('button', { name: /\+ add lead|add lead/i }))
      await W(page, 1200)
      const ins = page.locator('main input, main textarea')
      const n = await ins.count()
      for (let i = 0; i < Math.min(n, 5); i++) { const el = ins.nth(i); const v = await el.isVisible().catch(() => false); if (v) await el.fill(['Demo Buyer LLC', 'buyer.demo@example.com', '(717) 555-0199', 'Roofing / Home services', '500000'][i]).catch(() => {}) }
      await S(page, '05-add-lead-filled')
      await page.keyboard.press('Escape'); await W(page, 400)
    })
    await gotoView(page, BASE, '/dashboard/review-queue', { wait: 1500 }); await S(page, '06-review-queue')
  },

  // CH5 — Calendar, communications, marketing, newspaper, store
  5: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/calendar', { wait: 2000 }); await S(page, '01-calendar')
    await safe('book appointment', async () => {
      await clickHuman(page, page.getByRole('button', { name: /book appointment/i }))
      await W(page, 1200)
      const ins = page.locator('main input, main textarea')
      for (let i = 0; i < await ins.count(); i++) {
        const el = ins.nth(i); const ph = (await el.getAttribute('placeholder').catch(() => '')) || ''
        const vis = await el.isVisible().catch(() => false); if (!vis) continue
        if (/title/i.test(ph)) await el.fill('Valuation consult — Demo Seller')
        else if (/name/i.test(ph)) await el.fill('Demo Seller')
        else if (/email/i.test(ph)) await el.fill('demo@example.com')
        else if (/phone/i.test(ph)) await el.fill('(717) 555-0100')
        else if (/notes/i.test(ph)) await el.fill('Demo booking — product walkthrough')
        await W(page, 120)
      }
      await S(page, '02-booking-filled')
      await page.keyboard.press('Escape'); await W(page, 300)
    })
    await gotoView(page, BASE, '/dashboard/communications', { wait: 1400 }); await S(page, '03-communications')
    await gotoView(page, BASE, '/dashboard/marketing', { wait: 1600 }); await slowScroll(page, 800); await S(page, '04-marketing')
    await gotoView(page, BASE, '/dashboard/newspaper', { wait: 1600 }); await S(page, '05-newspaper')
    await gotoView(page, BASE, '/dashboard/store', { wait: 1400 }); await slowScroll(page, 700); await S(page, '06-store')
  },

  // CH6 — Deal room/docs/closing, finance, team, training, AI, reports, settings
  6: async (page) => {
    await login(page, BASE, EMAIL, PASSWORD)
    await gotoView(page, BASE, '/dashboard/deal-room', { wait: 1600 }); await S(page, '01-deal-room')
    await gotoView(page, BASE, '/dashboard/deal-docs', { wait: 1200 }); await S(page, '02-deal-docs')
    await gotoView(page, BASE, '/dashboard/closing', { wait: 1200 }); await S(page, '03-closing')
    await gotoView(page, BASE, '/dashboard/finance', { wait: 1400 }); await S(page, '04-finance')
    await gotoView(page, BASE, '/dashboard/team', { wait: 1200 }); await S(page, '05-team')
    await gotoView(page, BASE, '/dashboard/training', { wait: 1200 }); await S(page, '06-training')
    await gotoView(page, BASE, '/dashboard/ai', { wait: 1600 }); await slowScroll(page, 800); await S(page, '07-ai')
    await gotoView(page, BASE, '/dashboard/reports', { wait: 1200 }); await S(page, '08-reports')
    await gotoView(page, BASE, '/dashboard/settings', { wait: 1200 }); await S(page, '09-settings')
  },
}

// ─────────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true })
const ctxOpts = mode === 'real'
  ? { viewport: VIEWPORT, locale: 'en-US', recordVideo: { dir: `${OUT}/ch${ch}-${mode}`, size: VIEWPORT } }
  : { viewport: VIEWPORT }
const ctx = await browser.newContext(ctxOpts)
const page = await ctx.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(50000)

log(`CHAPTER ${ch} — mode ${mode}`)
try {
  await chapters[ch](page)
} catch (e) {
  console.error('CHAPTER FAILED:', e.message)
  process.exitCode = 1
} finally {
  await W(page, 300)
  const vpath = mode === 'real' ? await page.video()?.path().catch(() => null) : null
  await ctx.close(); await browser.close()
  log('done. video=' + (vpath || 'none'))
  const fs = await import('node:fs')
  fs.writeFileSync(`${OUT}/ch${ch}-${mode}/steps.json`, JSON.stringify(steps, null, 1))
  console.log(`__DONE__ ch${ch} ${mode} video=${vpath}`)
}
