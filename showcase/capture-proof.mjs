import { chromium } from '@playwright/test'
const shots = [
  ['/', '01-home'],
  ['/marketplace/listings', '02-marketplace'],
  ['/pricing', '03-pricing'],
]
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
for (const [path, name] of shots) {
  await page.goto('https://ezbusinessadvisors.vercel.app' + path, { waitUntil: 'networkidle', timeout: 45000 }).catch(()=>{})
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `showcase/${name}.png`, fullPage: false })
  console.log('captured', name)
}
await browser.close()
