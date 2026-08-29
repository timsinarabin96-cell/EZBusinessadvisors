import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const grids = [...document.querySelectorAll('div')].filter((d) => getComputedStyle(d).display === 'grid')
  return grids.map((g) => {
    const cs = getComputedStyle(g)
    const first = g.firstElementChild
    return {
      template: cs.gridTemplateColumns.slice(0, 60),
      w: Math.round(g.getBoundingClientRect().width),
      right: Math.round(g.getBoundingClientRect().right),
      firstTag: first ? first.tagName : '-',
    }
  }).filter((x) => x.w > 0).slice(0, 14)
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
