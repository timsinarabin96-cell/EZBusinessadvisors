// Diagnose hydration errors on the live homepage + contact page.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://ezbusinessadvisors.vercel.app'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 500)))

await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
const body = await page.locator('body').innerText()
console.log('HOMEPAGE first 200 chars:', JSON.stringify(body.slice(0, 200)))
console.log('HOMEPAGE shows error boundary:', body.includes('Something went sideways'))
console.log('HOMEPAGE shows hero:', body.includes('Total Confidence'))
console.log('---ERRORS---')
errors.slice(0, 8).forEach((e) => console.log(e))

// Contact page too
errors.length = 0
await page.goto(BASE + '/contact', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(5000)
const body2 = await page.locator('body').innerText()
console.log('CONTACT first 150 chars:', JSON.stringify(body2.slice(0, 150)))
console.log('CONTACT shows error boundary:', body2.includes('Something went sideways'))
console.log('CONTACT has Full Name input:', await page.locator('input[placeholder*="Full Name"]').count())
console.log('---ERRORS 2---')
errors.slice(0, 8).forEach((e) => console.log(e))

await browser.close()
