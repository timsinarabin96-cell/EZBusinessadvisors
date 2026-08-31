/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// MFA ENFORCEMENT — the login flow REFUSES admins without MFA.
// The exact test the advisor demanded: an admin account with NO MFA enrolled
// attempts login → the flow blocks it and forces TOTP enrollment. No dashboard,
// no redirect — enrollment is the only way forward. Then, to prove the full
// loop, the test generates a real TOTP code from the displayed secret and
// completes enrollment → login proceeds.
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/mfa-enforcement.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

test.setTimeout(180_000)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const hasAdminEnv = Boolean(SUPABASE_URL && SERVICE_KEY)
test.skip(!hasAdminEnv, 'mfa-enforcement requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')

const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

// --- tiny TOTP generator (RFC 6238) so the test can complete enrollment ---
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32Decode(s: string): Buffer {
  let bits = ''
  for (const c of s.toUpperCase().replace(/=+$/g, '')) {
    const v = B32.indexOf(c)
    if (v < 0) continue
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
function totp(secret: string, windowSec = 30, digits = 6): string {
  const counter = Math.floor(Date.now() / 1000 / windowSec)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = h[h.length - 1] & 0x0f
  const code = ((h[offset] & 0x7f) << 24 | (h[offset + 1] & 0xff) << 16 | (h[offset + 2] & 0xff) << 8 | (h[offset + 3] & 0xff)) % 10 ** digits
  return code.toString().padStart(digits, '0')
}

test.describe('MFA ENFORCEMENT — login refuses admins without 2FA', () => {
  test('admin without MFA is blocked at login and forced to enroll', async ({ page, request }) => {
    const stamp = Date.now().toString().slice(-6)
    const email = `mfa.admin.${stamp}@tenant.test`
    const pw = 'Mfa!Admin#2026#Concord'

    // ── Setup: a fresh agency with require_2fa=true + an admin member ──────
    // (service key: auth user + profile role owner + agency + membership)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: 'MFA Test Admin' } }),
    })
    if (!userRes.ok && userRes.status !== 409) throw new Error(`user create failed: ${userRes.status} ${await userRes.text()}`)
    const user = (await userRes.json()).user || (await (await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=eq.${email}`, { headers: svcHeaders })).json()).users?.[0]
    const userId = user.id

    const agencyRes = await fetch(`${SUPABASE_URL}/rest/v1/agencies`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ name: `MFA Test Agency ${stamp}`, slug: `mfa-test-${stamp}`, is_active: true, require_2fa: true }),
    })
    if (!agencyRes.ok) throw new Error(`agency create failed: ${agencyRes.status} ${await agencyRes.text()}`)
    const agency = (await agencyRes.json())[0]

    await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ id: userId, email, full_name: 'MFA Test Admin', role: 'owner', status: 'active' }),
    })
    await fetch(`${SUPABASE_URL}/rest/v1/agency_members`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ profile_id: userId, agency_id: agency.id, role: 'admin', is_owner: true }),
    })
    console.log('MFA-SETUP: admin created in require_2fa agency ✅', userId.slice(0, 8))

    // ── 1) THE BLOCK: login must NOT reach the dashboard ───────────────────
    await page.goto('/auth')
    await page.locator('input[type="email"]').first().fill(email)
    await page.locator('input[type="password"]').first().fill(pw)
    await page.getByRole('button', { name: /sign in/i }).first().click()

    // Must land on the ENROLLMENT step — not the dashboard.
    await page.getByText(/Set up two-factor authentication/i).waitFor({ timeout: 25000 })
    expect(page.url()).toContain('/auth')
    const body = await page.locator('body').innerText()
    expect(body).toMatch(/required/i)
    expect(body).toMatch(/Manual entry code/i)
    console.log('MFA-BLOCK: admin without MFA was REFUSED at login — forced to enroll ✅')

    // ── 2) Complete enrollment with a REAL generated TOTP code ─────────────
    const secretMatch = body.match(/Manual entry code:\s*([A-Z2-7]+)/i)
    expect(secretMatch, 'enrollment secret shown on page').toBeTruthy()
    const secret = secretMatch![1].trim()
    const code = totp(secret)
    await page.locator('input[inputmode="numeric"]').fill(code)
    await page.getByRole('button', { name: /Enable 2FA/i }).click()

    // After verifying the TOTP, the flow must continue into the workspace.
    await page.waitForURL(/dashboard|command-center|workspace/, { timeout: 25000 })
    console.log('MFA-ENROLL: TOTP verified → login completed after enrollment ✅')
  })
})
