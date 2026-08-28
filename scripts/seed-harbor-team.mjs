/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed a full brokerage TEAM under the Harbor Acquisitions tenant — the boss's
// "broker gets agents" scenario. Creates ONE broker (profile modeled on the
// boss's own: super-admin-style license fields, avatar, bio) plus FIVE agents
// with realistic broker-style profiles. All memberships land in the existing
// Harbor agency. Idempotent — re-running reuses existing users/rows.
//
// Run: node scripts/seed-harbor-team.mjs
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

const PW = 'Tenant!Test#2026#Concord'
const AGENCY_NAME = process.env.TENANT_AGENCY || 'Harbor Acquisitions'

// The broker mirrors the boss's own profile shape (license fields, avatar,
// verified buyer flags) — the "new Rabin" running the tenant brokerage.
const BROKER = {
  email: 'harbor.broker.principal@tenant.test',
  name: 'Daniel Harbor',
  role: 'broker',
  memberRole: 'broker',
  license: { number: 'HB-48291', state: 'PA', country: 'US', type: 'PA Real Estate Broker License' },
  bio: 'Principal broker at Harbor Acquisitions. 15 years in business brokerage, former owner of a commercial services firm, licensed in Pennsylvania.',
}

// Five agents — realistic business-broker profiles with distinct specialties.
const AGENTS = [
  { email: 'harbor.agent.one@tenant.test', name: 'Sarah Chen', role: 'agent', memberRole: 'agent', license: 'PA-22104', specialty: 'Healthcare & dental practices' },
  { email: 'harbor.agent.two@tenant.test', name: 'Marcus Webb', role: 'agent', memberRole: 'agent', license: 'PA-30118', specialty: 'Industrial & manufacturing' },
  { email: 'harbor.agent.three@tenant.test', name: 'Elena Rodriguez', role: 'agent', memberRole: 'agent', license: 'NJ-88231', specialty: 'Restaurants & food service' },
  { email: 'harbor.agent.four@tenant.test', name: 'James Okafor', role: 'agent', memberRole: 'agent', license: 'PA-45509', specialty: 'Logistics & transportation' },
  { email: 'harbor.agent.five@tenant.test', name: 'Priya Sharma', role: 'agent', memberRole: 'agent', license: 'DE-11920', specialty: 'Professional services & tech' },
]

const svc = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } })

async function upsertUser(email, name) {
  const { data: existing } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  let user = (existing?.users || []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    const { data, error } = await svc.auth.admin.createUser({
      email, password: PW, email_confirm: true,
      user_metadata: { full_name: name, avatar_placeholder: true },
    })
    if (error) throw error
    user = data.user
    console.log('  created user', email)
  }
  return user
}

// Resolve the Harbor agency id by name (idempotent across runs).
const { data: agency } = await svc.from('agencies').select('id').ilike('name', AGENCY_NAME).limit(1).maybeSingle()
if (!agency) throw new Error(`Agency "${AGENCY_NAME}" not found — run scripts/seed-tenant-e2e.mjs first`)
const agencyId = agency.id
console.log('== Harbor agency:', agencyId)

async function ensureMember(userId, role, isOwner = false) {
  const { data: existing } = await svc.from('agency_members').select('id').eq('agency_id', agencyId).eq('profile_id', userId).maybeSingle()
  if (existing) { console.log('  member exists:', role, userId.slice(0, 8)); return }
  const { error } = await svc.from('agency_members').insert({ agency_id: agencyId, profile_id: userId, role, is_owner: isOwner })
  if (error) throw new Error(`member insert failed (${role}): ${error.message}`)
  console.log('  member:', role, userId.slice(0, 8))
}

// 1) The broker (principal) — profile mirrors the boss's shape.
{
  const user = await upsertUser(BROKER.email, BROKER.name)
  const profile = {
    id: user.id,
    email: BROKER.email,
    full_name: BROKER.name,
    role: BROKER.role,
    status: 'active',
    license_type: BROKER.license.type,
    license_state: BROKER.license.state,
    license_country: BROKER.license.country,
    license_number: BROKER.license.number,
    license_verified: true,
    verified_buyer: true,
  }
  const { error } = await svc.from('profiles').upsert(profile, { onConflict: 'id' })
  if (error) throw new Error(`broker profile upsert: ${error.message}`)
  // Bio/specialty lives on broker_profiles (the public broker directory).
  const { error: bpErr } = await svc.from('broker_profiles').upsert({
    profile_id: user.id,
    agency_id: agencyId,
    name: BROKER.name,
    title: 'Principal Broker',
    bio: BROKER.bio,
    years_experience: 15,
    license_number: BROKER.license.number,
    license_state: BROKER.license.state,
    license_verified: true,
    is_active: true,
  }, { onConflict: 'profile_id' })
  if (bpErr && !String(bpErr.message).includes('column')) throw new Error(`broker_profiles upsert: ${bpErr.message}`)
  await ensureMember(user.id, BROKER.memberRole, false)
  console.log('  broker profile:', BROKER.name)
}

// 2) The five agents.
for (const a of AGENTS) {
  const user = await upsertUser(a.email, a.name)
  const profile = {
    id: user.id,
    email: a.email,
    full_name: a.name,
    role: a.role,
    status: 'active',
    license_type: 'PA Real Estate Salesperson License',
    license_state: a.license.slice(0, 2),
    license_country: 'US',
    license_number: a.license,
    license_verified: true,
    verified_buyer: false,
  }
  const { error } = await svc.from('profiles').upsert(profile, { onConflict: 'id' })
  if (error) throw new Error(`agent profile upsert (${a.email}): ${error.message}`)
  const { error: bpErr } = await svc.from('broker_profiles').upsert({
    profile_id: user.id,
    agency_id: agencyId,
    name: a.name,
    title: 'Business Broker',
    bio: `Business broker at ${AGENCY_NAME}. Specializes in ${a.specialty}.`,
    years_experience: 5 + AGENTS.indexOf(a) * 2,
    license_number: a.license,
    license_state: a.license.slice(0, 2),
    license_verified: true,
    is_active: true,
  }, { onConflict: 'profile_id' })
  if (bpErr && !String(bpErr.message).includes('column')) throw new Error(`broker_profiles upsert (${a.email}): ${bpErr.message}`)
  await ensureMember(user.id, a.memberRole, false)
  console.log('  agent profile:', a.name, `(${a.specialty})`)
}

console.log('\n--- HARBOR TEAM CREDENTIALS ---')
console.log(`TENANT_BROKER_EMAIL=${BROKER.email}`)
for (const a of AGENTS) console.log(`TENANT_AGENT_${a.email.split('.')[2].toUpperCase()}_EMAIL=${a.email}`)
console.log(`TENANT_PASSWORD=${PW}`)
