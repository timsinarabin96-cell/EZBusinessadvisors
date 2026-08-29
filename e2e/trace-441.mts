import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/marketplace/listings', { waitUntil: 'networkidle' })
await page.waitForTimeout(4000)
const info = await page.evaluate(() => {
  const grid = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).gridTemplateColumns.includes('386'))
  if (!grid) return 'grid not found'
  const card = grid.firstElementChild
  const tmp = card.cloneNode(true)
  tmp.style.cssText = 'position:absolute;visibility:hidden;width:max-content;left:-9999px;top:0'
  document.body.appendChild(tmp)
  // find widest descendants in the clone
  let widest = { tag: '', w: 0, text: '', style: '' }
  tmp.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width > widest.w) widest = { tag: el.tagName, w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 40), style: (el.getAttribute('style') || '').slice(0, 100) }
  })
  tmp.remove()
  return { minContent: widest }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
