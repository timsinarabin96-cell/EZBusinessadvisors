/**
 * Cross-browser smoke test — loads key public pages in Firefox + WebKit
 * (Chromium already covered by the main e2e suite) and asserts no hard
 * failures. Fails the CI step if any engine can't launch or any page
 * returns HTTP >= 400 or logs JS errors.
 * Run: node --import ./scripts/paths-loader.mjs --experimental-strip-types scripts/cross-browser-smoke.mts
 */
import { chromium, firefox, webkit } from '@playwright/test'

const BASE = (process.env.BASE_URL || 'https://ezbusinessadvisors.vercel.app').replace(/\/+$/, '')
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/marketplace/listings', name: 'marketplace' },
  { path: '/marketplace/franchise', name: 'franchise sell page' },
  { path: '/pricing', name: 'pricing' },
]

async function runEngine(name: string, engine: any): Promise<boolean> {
  const results: Array<{ page: string; status: number | null; title: string; errors: number }> = []
  let ok = true
  let browser
  try {
    browser = await engine.launch({ headless: true })
    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => { errors.push(`pageerror: ${e.message.slice(0, 120)}`); ok = false })
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 120)}`) })
    for (const p of PAGES) {
      try {
        const resp = await page.goto(BASE + p.path, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const title = await page.title().catch(() => '')
        const status = resp?.status() ?? null
        results.push({ page: p.name, status, title: title.slice(0, 60), errors: errors.length })
        if (status !== null && status >= 400) {
          errors.push(`${p.name}: HTTP ${status}`)
          ok = false
        }
      } catch (e: any) {
        results.push({ page: p.name, status: null, title: '', errors: 1 })
        errors.push(`goto: ${String(e?.message || e).slice(0, 120)}`)
        ok = false
      }
    }
    await browser.close()
    console.log(`\n== ${name} ==`)
    for (const r of results) console.log(`  ${r.page}: HTTP ${r.status} | "${r.title}" | jsErrors=${r.errors}`)
    if (errors.length) console.log(`  [${name}] errors: ${errors.slice(0, 4).join(' | ')}`)
  } catch (e: any) {
    console.log(`\n== ${name} == LAUNCH FAILED: ${String(e?.message || e).slice(0, 200)}`)
    ok = false
    if (browser) await browser.close().catch(() => {})
  }
  return ok
}

async function main() {
  const engines = [
    ['FIREFOX', firefox],
    ['WEBKIT', webkit],
    ['CHROMIUM', chromium],
  ] as const
  const results: Array<[string, boolean]> = []
  for (const [name, engine] of engines) {
    results.push([name, await runEngine(name, engine)])
  }
  console.log(`\n== SUMMARY ==`)
  for (const [name, ok] of results) console.log(`  ${name}: ${ok ? 'PASS' : 'FAIL'}`)
  if (results.some(([, ok]) => !ok)) process.exit(1)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
