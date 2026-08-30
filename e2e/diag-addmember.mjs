// Capture the exact error toast when adding a member fails.
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL || 'https://ezbusinessadvisors.vercel.app'
const EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'

const { createClient } = await import('@supabase/supabase-js')
// Load .env.local manually (plain node doesn't get it injected like playwright does)
const { readFileSync } = await import('node:fs')
const envText = readFileSync('.env.local', 'utf8')
const envGet = (k) => {
  const m = envText.match(new RegExp(`^${k}="?([^"\n]*)?"?$`, 'm'))
  return m ? m[1] : undefined
}
const admin = createClient(envGet('NEXT_PUBLIC_SUPABASE_URL'), envGet('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const email = `audit.agent.${Date.now().toString().slice(-6)}@concordplatform.dev`
const { data: u } = await admin.auth.admin.createUser({ email, password: 'Audit!Agent#2026', email_confirm: true, user_metadata: { full_name: 'Audit Agent' } })
await admin.from('profiles').upsert({ id: u.user.id, email, full_name: 'Audit Agent', role: 'associate', status: 'active' }, { onConflict: 'id' })
console.log('created user:', u.user.id)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
// Capture console + failed requests
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 300)) })
page.on('requestfailed', (r) => console.log('REQ FAILED:', r.url().slice(0, 120), r.failure()?.errorText))
page.on('response', (r) => { if (r.url().includes('rest/v1/agency_members')) console.log('AGENCY_MEMBERS API:', r.status(), r.url().slice(-60)) })

await page.goto(BASE + '/auth')
await page.locator('input[type="email"]').first().fill(EMAIL)
await page.locator('input[type="password"]').first().fill(PASSWORD)
await page.getByRole('button', { name: /sign in/i }).first().click()
await page.waitForLoadState('networkidle').catch(() => {})
await page.goto(BASE + '/agencies')
await page.waitForLoadState('domcontentloaded')
await page.waitForTimeout(2500)

const btns = page.locator('button', { hasText: 'concordplatform.com' })
await btns.nth(1).click()
await page.waitForTimeout(1500)

await page.getByRole('button', { name: '+ Add Member' }).click()
await page.locator('input[placeholder="uuid"]').fill(u.user.id)
// Capture any toast right after clicking Add
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.waitForTimeout(3000)
const toasts = await page.locator('.toast').allInnerTexts().catch(() => [])
console.log('TOASTS:', JSON.stringify(toasts))
const body = await page.locator('body').innerText()
console.log('member list contains truncated id:', body.includes(u.user.id.slice(0, 8)))
console.log('modal still open:', await page.getByRole('heading', { name: /Add Member to/ }).isVisible().catch(() => false))

await admin.auth.admin.deleteUser(u.user.id).catch(() => {})
await browser.close()
