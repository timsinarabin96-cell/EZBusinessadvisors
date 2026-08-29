import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
// Disable cache entirely
await page.route('**/*', (route) => route.continue())
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const grids = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).display === 'grid' && getComputedStyle(d).gridTemplateColumns.includes('minmax'))
  return grids.map((g) => ({ grid: getComputedStyle(g).gridTemplateColumns.slice(0, 60), w: Math.round(g.getBoundingClientRect().width) })).slice(0, 8)
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
