/**
 * REAL ACTIONS take — boss's ask: "do the work yourself." Live creates:
 * 1) New Deal from pipeline (select listing, type price, pick stage)
 * 2) Open the newly created deal, browse detail
 */
import { chromium } from '/root/projects/concord-deal-platform/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { VIEWPORT, makeLogger, login, gotoView, slowScroll, shot, clickHuman, typeHuman } from './demo-lib.mjs'

const BASE = 'https://concorddeal.com'
const EMAIL = 'demo.owner@concordplatform.dev'
const PASSWORD = 'DemoOwner2026!'
const OUT = '/root/.openclaw/workspace/demo-deck/live-2026-09-04'
const mode = 'real'
const t0 = Date.now()
const { log } = makeLogger(t0)
mkdirSync(`${OUT}/deep5-${mode}/shots`, { recursive: true })
const W = (p, ms) => p.waitForTimeout(ms)
const S = (p, n) => shot(p, `${OUT}/deep5-${mode}/shots`, n)
async function safe(name, fn) { try { await fn(); log(`ok  ${name}`) } catch (e) { log(`!!  ${name} -> ${e.message.slice(0, 90)}`) } }

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', recordVideo: { dir: `${OUT}/deep5-${mode}`, size: VIEWPORT } })
const page = await ctx.newPage()
page.setDefaultTimeout(20000)
page.setDefaultNavigationTimeout(50000)
try {
  await login(page, BASE, EMAIL, PASSWORD)
  await gotoView(page, BASE, '/pipeline', { wait: 2500 }); await S(page, '01-pipeline')
  await safe('open New Deal modal', async () => {
    await clickHuman(page, page.getByRole('button', { name: /\+ new deal|new deal/i }))
    await W(page, 1500); await S(page, '02-new-deal-modal')
  })
  await safe('select listing + type price', async () => {
    // pick Lancaster GreenScape (available, active)
    await page.locator('select.select, select').first().selectOption({ label: /GreenScape/ }).catch(async () => {
      const opts = await page.locator('select option').allTextContents()
      log('listing options: ' + JSON.stringify(opts.slice(0, 8)))
      const idx = opts.findIndex((o) => /GreenScape|Janitorial|Car Wash/i.test(o))
      if (idx > 0) await page.locator('select option').nth(idx).evaluate((o) => { o.selected = true; o.dispatchEvent(new Event('change', { bubbles: true })) })
    })
    await W(page, 800)
    const money = page.locator('input[inputmode="decimal"]').first()
    await money.click().catch(() => {})
    await page.keyboard.type('350000', { delay: 30 })
    await S(page, '03-deal-filled')
  })
  await safe('pick stage Letter of Intent', async () => {
    await clickHuman(page, page.getByRole('button', { name: /letter of intent/i }))
    await W(page, 500)
  })
  await safe('submit Create Deal', async () => {
    await clickHuman(page, page.getByRole('button', { name: /create deal/i }))
    await W(page, 3500); await S(page, '04-deal-created')
  })
  await gotoView(page, BASE, '/pipeline', { wait: 2500 }); await slowScroll(page, 500); await S(page, '05-pipeline-after')
  log('REAL ACTION TAKE DONE')
} catch (e) { console.error('FAILED:', e.message); process.exitCode = 1 }
finally {
  await W(page, 300)
  const vpath = await page.video()?.path().catch(() => null)
  await ctx.close(); await browser.close()
  console.log(`__DONE__ deep5 video=${vpath}`)
}
