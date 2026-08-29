import { chromium } from 'playwright'
const BASE = 'https://concord-deal-platform.vercel.app'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE + '/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.screenshot({ path: '/root/.openclaw/workspace/media/home-mobile-fixed.png', fullPage: false })
await browser.close()
