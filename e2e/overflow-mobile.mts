import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const wide = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.right > document.documentElement.clientWidth + 2) {
      out.push({ tag: el.tagName, cls: (el.className + '').slice(0, 50), right: Math.round(r.right), w: Math.round(r.width), pos: getComputedStyle(el).position })
    }
  })
  return out.slice(0, 10)
})
console.log(JSON.stringify(wide, null, 1))
await browser.close()
