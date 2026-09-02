/**
 * Cross-browser smoke test — loads key public pages in Firefox + WebKit
 * (Chromium already covered by the main e2e suite) and asserts no hard
 * failures. Run: node --import ./scripts/paths-loader.mjs --experimental-strip-types scripts/cross-browser-smoke.mts
 */
import { chromium, firefox, webkit } from '@playwright/test'

const BASE = 'https://ezbusinessadvisors.vercel.app'
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/marketplace/listings', name: 'marketplace' },
  { path: '/marketplace/franchise', name: 'franchise sell page' },
  { path: '/pricing', name: 'pricing' },
]

async function runEngine(name: string, engine: any) {
  const results: Array<{ page: string; status: number | null; title: string; errors: number }> = []
  let browser
  try {
    browser = await engine.launch({ headless: true })
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 120)}`))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 120)}`) })
    for (const p of PAGES) {
      try {
        const resp = await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const title = await page.title().catch(() => '')
        results.push({ page: p.name, status: resp?.status() ?? null, title: title.slice(0, 60), errors: errors.length })
      } catch (e: any) {
        results.push({ page: p.name, status: null, title: '', errors: 1 })
        errors.push(`goto: ${String(e?.message || e).slice(0, 120)}`)
      }
    }
    await browser.close()
    console.log(`\n== ${name} ==`)
    for (const r of results) console.log(`  ${r.page}: HTTP ${r.status} | "${r.title}" | jsErrors=${r.errors}`)
    if (errors.length) console.log(`  [${name}] errors: ${errors.slice(0, 4).join(' | ')}`)
  } catch (e: any) {
    console.log(`\n== ${name} == LAUNCH FAILED: ${String(e?.message || e).slice(0, 200)}`)
    if (browser) await browser.close().catch(() => {})
  }
}

async function main() {
  await runEngine('FIREFOX', firefox)
  await runEngine('WEBKIT', webkit)
  // Chromium baseline for contrast
  await runEngine('CHROMIUM', chromium)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
