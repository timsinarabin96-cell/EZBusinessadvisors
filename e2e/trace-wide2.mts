import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
const wide = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.right > 392) {
      out.push({ tag: el.tagName, cls: (el.className + '').slice(0, 50), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 50), style: (el.getAttribute('style') || '').slice(0, 80) })
    }
  })
  return out.slice(0, 12)
})
console.log(JSON.stringify(wide, null, 1))
await browser.close()
