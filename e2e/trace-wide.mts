import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const de = document.documentElement
  const body = document.body
  const grid = [...document.querySelectorAll('div')].find((d) => d.style && d.style.gridTemplateColumns && d.style.gridTemplateColumns.includes('minmax(320px'))
  let chain = []
  if (grid) {
    let el = grid
    for (let i = 0; i < 6 && el; i++) {
      const r = el.getBoundingClientRect()
      chain.push({ tag: el.tagName, w: Math.round(r.width), right: Math.round(r.right), cls: (el.className + '').slice(0, 40), style: (el.getAttribute('style') || '').slice(0, 90) })
      el = el.parentElement
    }
  }
  return {
    docScrollW: de.scrollWidth, clientW: de.clientWidth, bodyScrollW: body.scrollWidth,
    gridFound: !!grid, chain
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
