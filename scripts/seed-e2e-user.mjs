/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed the E2E test account via Supabase admin API + the real create-agency
// route. Run: node scripts/seed-e2e-user.mjs
// Creates (idempotently): a confirmed-auth test user, then signs in and calls
// /api/billing/create-agency so the whole stack is exercised.
// =============================================================================

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        const key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
        return [key, value]
      }),
  )
}

const env = parseEnv(readFileSync('.env.local', 'utf8'))
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_KEY) throw new Error('Supabase URL + service role key required in .env.local')

const EMAIL = process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev'
const PASSWORD = process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord'
const AGENCY = process.env.E2E_AGENCY || 'QA Test Brokerage'

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

// 1) Upsert the user (admin API — email confirmed, no verification needed).
const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError
let user = existing.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'QA Test Broker' },
  })
  if (error) throw error
  user = data.user
  console.log('✅ created user', EMAIL, user.id)
} else {
  console.log('✅ user exists', EMAIL, user.id)
}

// 2) Ensure the profile row exists (role=owner, status=active).
const { error: profileError } = await admin.from('profiles').upsert({
  id: user.id,
  email: EMAIL,
  full_name: 'QA Test Broker',
  role: 'owner',
  status: 'active',
}, { onConflict: 'id' })
if (profileError) console.warn('⚠️ profile upsert:', profileError.message)
else console.log('✅ profile ready')

// 3) Sign in through the real auth endpoint to get a session for create-agency.
const { data: signIn, error: signInError } = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (signInError) throw signInError
const session = signIn.session
console.log('✅ signed in')

// 4) Call the REAL create-agency route with the user's session token.
const res = await fetch(`${URL}/functions/v1/placeholder`, { method: 'GET' }).catch(() => null)
const res2 = await fetch(`${env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/billing/create-agency`.replace('http://localhost:3000', 'https://concord-deal-platform.vercel.app'), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ name: AGENCY, tier: 'professional', startTrial: true, profileId: user.id }),
})
const body = await res2.json().catch(() => ({}))
console.log('create-agency:', res2.status, JSON.stringify(body).slice(0, 200))

// 5) Print credentials for Playwright (also honor env overrides).
console.log('\n--- E2E CREDENTIALS ---')
console.log(`E2E_EMAIL=${EMAIL}`)
console.log(`E2E_PASSWORD=${PASSWORD}`)
console.log(`E2E_AGENCY=${AGENCY}`)
