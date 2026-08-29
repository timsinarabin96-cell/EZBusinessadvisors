import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const wide = await page.evaluate(() => {
  const out = []
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.right > document.documentElement.clientWidth + 2 || r.left < -2) {
      const cs = getComputedStyle(el)
      out.push({ tag: el.tagName, cls: (el.className + '').slice(0, 40), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width), pos: cs.position })
    }
  })
  return out.slice(0, 12)
})
console.log(JSON.stringify(wide, null, 1))
await browser.close()
