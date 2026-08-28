/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed a FRESH TENANT end-to-end — simulates selling the CRM to a new
// brokerage ("Harbor Acquisitions") and provisioning its whole team:
//   owner (the CRM buyer) → creates the agency via the REAL create-agency flow
//   agent / broker / admin → created in that agency via the REAL admin API
//   buyer + seller → external portal identities
// Run: node scripts/seed-tenant-e2e.mjs
// Idempotent: re-running reuses existing users/agency.
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

const AGENCY = process.env.TENANT_AGENCY || 'Harbor Acquisitions'
const SITE = process.env.E2E_SITE_URL || 'http://localhost:3000'
const PW = 'Tenant!Test#2026#Concord'

const USERS = {
  owner: { email: 'harbor.owner@tenant.test', name: 'Harbor Owner' },
  agent: { email: 'harbor.agent@tenant.test', name: 'Harbor Agent' },
  broker: { email: 'harbor.broker@tenant.test', name: 'Harbor Broker' },
  admin: { email: 'harbor.admin@tenant.test', name: 'Harbor Admin' },
  buyer: { email: 'harbor.buyer@tenant.test', name: 'Harbor Buyer' },
  seller: { email: 'harbor.seller@tenant.test', name: 'Harbor Seller' },
}

const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })
// Dedicated sign-in client: signing in on the SERVICE client would swap its
// auth header from the service-role key to the user's JWT (supabase-js
// behavior), silently breaking all subsequent service-role writes.
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

async function upsertUser(email, name) {
  const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  let user = (existing?.users || []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, user_metadata: { full_name: name } })
    if (error) throw error
    user = data.user
    console.log('  created user', email)
  } else {
    console.log('  user exists', email)
  }
  return user
}

// 1) Owner — the person who "bought" the CRM.
console.log('== Provisioning tenant:', AGENCY)
const owner = await upsertUser(USERS.owner.email, USERS.owner.name)
await admin.from('profiles').upsert({ id: owner.id, email: USERS.owner.email, full_name: USERS.owner.name, role: 'owner', status: 'active' }, { onConflict: 'id' })

// 2) Owner signs in via real auth → creates the agency via the REAL route.
//    Idempotent: if the owner already owns an agency with this name, reuse it.
const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email: USERS.owner.email, password: PW })
if (signInErr) throw signInErr

const { data: ownedAgency } = await admin
  .from('agencies')
  .select('id')
  .ilike('name', AGENCY)
  .limit(1)
  .maybeSingle()

let agencyId = ownedAgency?.id || null
if (!agencyId) {
  const res = await fetch(`${SITE}/api/billing/create-agency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.session.access_token}` },
    body: JSON.stringify({ name: AGENCY, tier: 'professional', startTrial: true, profileId: owner.id }),
  })
  const body = await res.json().catch(() => ({}))
  console.log('create-agency:', res.status, JSON.stringify(body).slice(0, 160))
  agencyId = body.agency?.id || body.agencyId || null
  if (!agencyId) throw new Error('Agency not created: ' + JSON.stringify(body).slice(0, 300))
} else {
  console.log('reusing existing agency:', agencyId)
}
console.log('agency id:', agencyId)

// 3) Team roles in that agency (profiles + agency_members).
const teamRoles = { agent: 'agent', broker: 'broker', admin: 'admin' }
for (const [key, u] of Object.entries(USERS)) {
  if (key === 'owner' || key === 'buyer' || key === 'seller') continue
  const user = await upsertUser(u.email, u.name)
  await admin.from('profiles').upsert({ id: user.id, email: u.email, full_name: u.name, role: teamRoles[key], status: 'active' }, { onConflict: 'id' })
  const { data: existingMember } = await admin.from('agency_members').select('id').eq('agency_id', agencyId).eq('profile_id', user.id).maybeSingle()
  if (!existingMember) {
    const { error: memErr } = await admin.from('agency_members').insert({ agency_id: agencyId, profile_id: user.id, role: teamRoles[key], is_owner: false })
    if (memErr) throw new Error(`member insert failed for ${key}: ${memErr.message}`)
    console.log('  member:', key, user.email)
  } else {
    console.log('  member exists:', key, user.email)
  }
}

// 4) Buyer + seller portal identities (no agency membership — external).
for (const key of ['buyer', 'seller']) {
  const u = USERS[key]
  const user = await upsertUser(u.email, u.name)
  await admin.from('profiles').upsert({ id: user.id, email: u.email, full_name: u.name, role: key, status: 'active' }, { onConflict: 'id' })
}

console.log('\n--- TENANT CREDENTIALS ---')
console.log(`TENANT_AGENCY=${AGENCY}`)
console.log(`TENANT_AGENCY_ID=${agencyId}`)
console.log(`TENANT_PASSWORD=${PW}`)
for (const [key, u] of Object.entries(USERS)) console.log(`TENANT_${key.toUpperCase()}_EMAIL=${u.email}`)
console.log(`TENANT_SITE=${SITE}`)
