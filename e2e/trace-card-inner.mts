import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const card = [...document.querySelectorAll('a')].find((a) => (a.textContent || '').includes('Full Role Biz') && getComputedStyle(a).display === 'block')
  const out = []
  if (card) {
    card.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width > 342) {
        out.push({ tag: el.tagName, w: Math.round(r.width), right: Math.round(r.right), minW: cs.minWidth, flex: cs.flex, whiteSpace: cs.whiteSpace.slice(0, 12), text: (el.textContent || '').trim().slice(0, 30), style: (el.getAttribute('style') || '').slice(0, 90) })
      }
    })
  }
  return out.slice(0, 10)
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
