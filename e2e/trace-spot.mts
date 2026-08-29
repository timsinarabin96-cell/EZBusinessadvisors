import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a')].find((a) => (a.textContent || '').includes('Recurring-Revenue'))
  const chain = []
  if (link) {
    let el = link
    for (let i = 0; i < 8 && el; i++) {
      const r = el.getBoundingClientRect()
      chain.push({ tag: el.tagName, w: Math.round(r.width), right: Math.round(r.right), cls: (el.className + '').slice(0, 30), style: (el.getAttribute('style') || '').slice(0, 100) })
      el = el.parentElement
    }
  }
  return chain
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
