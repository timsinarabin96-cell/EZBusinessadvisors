import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const grid = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).gridTemplateColumns.includes('386'))
  if (!grid) return 'grid not found'
  const kids = [...grid.children].map((k) => {
    const cs = getComputedStyle(k)
    return { tag: k.tagName, cls: (k.className + '').slice(0, 20), display: cs.display, minW: cs.minWidth, w: Math.round(k.getBoundingClientRect().width), overflow: cs.overflowX }
  })
  return { gridW: Math.round(grid.getBoundingClientRect().width), gridTemplate: getComputedStyle(grid).gridTemplateColumns, childCount: kids.length, kids: kids.slice(0, 3) }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
