import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const info = await page.evaluate(() => {
  const card = [...document.querySelectorAll('a')].find((a) => (a.textContent || '').includes('Full Role Biz') && getComputedStyle(a).display === 'block')
  const chain = []
  if (card) {
    let el = card
    for (let i = 0; i < 9 && el; i++) {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      chain.push({ tag: el.tagName, w: Math.round(r.width), right: Math.round(r.right), display: cs.display, grid: cs.gridTemplateColumns.slice(0, 60), cls: (el.className + '').slice(0, 30), maxW: cs.maxWidth })
      el = el.parentElement
    }
  } else console.log('NO BLOCK CARD FOUND')
  return chain
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
