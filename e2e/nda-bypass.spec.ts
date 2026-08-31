/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 */

// =============================================================================
// NDA-BYPASS — the advisor's demanded vectors, not just anonymous 401s:
//   1. Anonymous: direct API hits → 401/403/404 (baseline)
//   2. Direct doc URL guessing: storage public-URL patterns for the private
//      financial_docs bucket → must NOT resolve (400/404)
//   3. Authenticated-but-non-NDA'd buyer: signs in, then requests another
//      tenant's financial/data-room/closing data → must be 403
//   4. Listing-ID modification: same non-NDA session, swap listing IDs → still 403
// Run: E2E_EMAIL=... E2E_PASSWORD=*** npx playwright test e2e/nda-bypass.spec.ts
// =============================================================================

import { test, expect } from '@playwright/test'
import { signIn, getAuthToken } from './helpers'

test.setTimeout(180_000)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const hasAdminEnv = Boolean(SUPABASE_URL && SERVICE_KEY)
test.skip(!hasAdminEnv, 'nda-bypass requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')

const svcHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

test.describe('NDA GATE — bypass vectors', () => {
  test('anonymous + direct URL guessing + authenticated non-NDA session all blocked', async ({ page, request }) => {
    // ── Find a confidential listing from a tenant we are NOT a member of ──
    const listingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/listings?select=id,business_name,agency_id,confidentiality_level&order=created_at.desc&limit=20`,
      { headers: svcHeaders },
    )
    const listings = await listingRes.json()
    const target = (listings as any[]).find((l) => l.confidentiality_level !== 'full') || (listings as any[])[0]
    expect(target, 'found a listing to attack').toBeTruthy()
    const targetId = target.id
    console.log('NDA-TARGET:', target.business_name, targetId.slice(0, 8))

    // ── 1) ANONYMOUS: direct API hits must be gated ────────────────────────
    const anonProbes: [string, string][] = [
      ['closing', `/api/closing?listingId=${targetId}`],
      ['deal-room', `/api/data-rooms/room?dealId=${targetId}`],
    ]
    for (const [name, path] of anonProbes) {
      const res = await request.get(path)
      const ok = [401, 403, 404, 405].includes(res.status())
      console.log(`NDA-ANON ${name}: ${res.status()} ${ok ? '✅ gated' : '⚠️ OPEN'}`)
      expect(ok, `anonymous ${name} must be gated`).toBe(true)
    }
    // POST-only route (financial import) — anonymous POST must 401, not import.
    const finRes = await request.post(`/api/listings/financial-import`, { data: { listingId: targetId } })
    const finOk = [401, 403, 404, 405].includes(finRes.status())
    console.log(`NDA-ANON financial-import(POST): ${finRes.status()} ${finOk ? '✅ gated' : '⚠️ OPEN'}`)
    expect(finOk, 'anonymous financial-import POST must be gated').toBe(true)

    // ── 2) DIRECT DOC URL GUESSING: private bucket public patterns ──────────
    const guesses = [
      `/storage/v1/object/public/financial_docs/${targetId}/p&l.pdf`,
      `/storage/v1/object/public/financial_docs/${targetId}/taxes.pdf`,
      `/storage/v1/object/public/financial_docs/guess.pdf`,
    ]
    for (const g of guesses) {
      const res = await request.get(`${SUPABASE_URL}${g}`)
      const ok = res.status() >= 400
      console.log(`NDA-GUESS ${g.split('/').pop()}: ${res.status()} ${ok ? '✅ dead' : '⚠️ RESOLVED'}`)
      expect(ok, `guessed storage URL must not resolve: ${g}`).toBe(true)
    }

    // ── 3) AUTHENTICATED NON-NDA SESSION: a fresh buyer with NO relationship ─
    const stamp = Date.now().toString().slice(-6)
    const email = `nda.buyer.${stamp}@tenant.test`
    const pw = 'Nda!Buyer#2026#Concord'
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: svcHeaders,
      body: JSON.stringify({ email, password: pw, email_confirm: true, user_metadata: { full_name: 'NDA Bypass Buyer' } }),
    })
    if (!userRes.ok && userRes.status !== 409) throw new Error(`buyer create failed: ${userRes.status} ${await userRes.text()}`)
    const user = (await userRes.json()).user || (await (await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=eq.${email}`, { headers: svcHeaders })).json()).users?.[0]
    await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...svcHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ id: user.id, email, full_name: 'NDA Bypass Buyer', role: 'buyer', status: 'active' }),
    })

    await signIn(page, email, pw)
    await expect(page).toHaveURL(/dashboard|marketplace/, { timeout: 20000 })
    const token = await getAuthToken(page)
    expect(token, 'buyer session token').toBeTruthy()
    const authHeaders = { Authorization: `Bearer ${token}` }
    console.log('NDA-BUYER: signed in as fresh buyer with NO NDA ✅')

    // 3a) Buyer (no NDA) hits the target listing's protected endpoints.
    const buyerProbes: [string, string][] = [
      ['closing', `/api/closing?listingId=${targetId}`],
      ['deal-room', `/api/data-rooms/room?dealId=${targetId}`],
      ['readiness', `/api/listings/readiness?listingId=${targetId}`],
    ]
    for (const [name, path] of buyerProbes) {
      const res = await request.get(path, { headers: authHeaders })
      const ok = [401, 403, 404].includes(res.status())
      console.log(`NDA-BUYER ${name}: ${res.status()} ${ok ? '✅ blocked' : '⚠️ OPEN'}`)
      expect(ok, `buyer (no NDA) ${name} must be blocked`).toBe(true)
    }

    // 3b) Listing-ID MODIFICATION: swap to a second listing → still blocked.
    const second = (listings as any[]).find((l) => l.id !== targetId) || target
    const swapRes = await request.get(`/api/closing?listingId=${second.id}`, { headers: authHeaders })
    const swapOk = [401, 403, 404].includes(swapRes.status())
    console.log(`NDA-SWAP listing-id: ${swapRes.status()} ${swapOk ? '✅ blocked' : '⚠️ OPEN'}`)
    expect(swapOk, 'listing-id swap must still be blocked').toBe(true)

    console.log('NDA-BYPASS: all vectors blocked ✅')
  })
})
