import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
for (const path of ['/marketplace/listings', '/']) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const wide = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('a, img, table, iframe, [class]').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > document.documentElement.clientWidth + 2 && r.width > 50) {
        out.push({ tag: el.tagName, cls: (el.className + '').slice(0, 60), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 40), href: (el.getAttribute('href') || '').slice(0, 60) })
      }
    })
    return out.slice(0, 8)
  })
  console.log('=== ' + path + ' ===')
  console.log(JSON.stringify(wide, null, 1))
}
await browser.close()
