import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const grids = [...document.querySelectorAll('div')].filter((d) => {
    const cs = getComputedStyle(d)
    return cs.display === 'grid' && cs.gridTemplateColumns !== 'none' && cs.gridTemplateColumns.length > 0
  })
  return grids.map((g) => {
    const cs = getComputedStyle(g)
    return { grid: cs.gridTemplateColumns.slice(0, 70), w: Math.round(g.getBoundingClientRect().width), right: Math.round(g.getBoundingClientRect().right) }
  }).slice(0, 12)
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
