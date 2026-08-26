/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Backfill public.broker_profiles from existing agency members.
//
// For every agency_members row where role in ('broker','admin') OR is_owner=true,
// create (or update) a broker_profile keyed on profile_id, pulling display data
// from public.profiles (full_name -> public_name, email -> email_public,
// avatar_url, phone when the column exists).
//
// 'agent' role members are NOT backfilled yet (later phase) — only counted.
//
// Idempotent: upserts on profile_id when a unique constraint exists; otherwise
// falls back to a select-then-update/insert merge loop.
//
// Usage: node scripts/backfill-broker-profiles.mjs
// =============================================================================
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      const key = line.slice(0, index).trim()
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [key, value]
    }))
}

const env = parseEnv(await readFile('.env.local', 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required')

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const TARGET_ROLES = ['broker', 'admin', 'agent']

// ---------------------------------------------------------------------------
// Probe: does public.profiles expose a phone column? (live schema varies)
// ---------------------------------------------------------------------------
const { error: phoneProbeErr } = await db.from('profiles').select('phone').limit(1)
const profilesHavePhone = !phoneProbeErr
console.log(`[probe] profiles.phone column present: ${profilesHavePhone}`)

// ---------------------------------------------------------------------------
// Load members + profiles
// ---------------------------------------------------------------------------
const { data: members, error: membersErr } = await db
  .from('agency_members')
  .select('profile_id, agency_id, role, is_owner')

if (membersErr) throw new Error(`agency_members fetch failed: ${membersErr.message}`)
console.log(`[load] agency_members rows: ${members.length}`)

const profileColumns = ['id', 'full_name', 'email', 'avatar_url']
if (profilesHavePhone) profileColumns.push('phone')

const { data: profiles, error: profilesErr } = await db
  .from('profiles')
  .select(profileColumns.join(','))

if (profilesErr) throw new Error(`profiles fetch failed: ${profilesErr.message}`)

const profilesById = new Map(profiles.map((p) => [p.id, p]))

// ---------------------------------------------------------------------------
// Decide who gets a broker profile
// ---------------------------------------------------------------------------
const targets = []
const agentCounts = { agent: 0, other: 0 }

for (const m of members) {
  const isOwner = m.is_owner === true
  if (TARGET_ROLES.includes(m.role) || isOwner) {
    targets.push(m)
  } else if (m.role === 'agent') {
    // agents included now — all team members get a synced public profile
    targets.push(m)
  } else {
    agentCounts.other += 1
  }
}

console.log(
  `[select] broker/admin/owner targets: ${targets.length} | ` +
  `agent-role members (later phase): ${agentCounts.agent} | other roles: ${agentCounts.other}`
)

// ---------------------------------------------------------------------------
// Build broker_profile rows
// ---------------------------------------------------------------------------
const rows = []
const skipped = []
for (const m of targets) {
  const profile = profilesById.get(m.profile_id)
  if (!profile) {
    skipped.push({ profile_id: m.profile_id, agency_id: m.agency_id, reason: 'no profiles row' })
    continue
  }
  const row = {
    profile_id: m.profile_id,
    agency_id: m.agency_id,
    public_name: profile.full_name || null,
    email_public: profile.email || null,
    avatar_url: profile.avatar_url || null,
  }
  if (profilesHavePhone) row.phone = profile.phone || null
  rows.push(row)
}

if (skipped.length) console.log(`[skip] ${skipped.length} membership(s) without a profiles row:`, skipped)

// ---------------------------------------------------------------------------
// Dedupe: one broker_profile per profile_id. A profile can hold multiple
// memberships (same owner across several agencies) — prefer an owner
// membership, then the first agency encountered.
// ---------------------------------------------------------------------------
const rowsById = new Map()
for (const row of rows) {
  const existing = rowsById.get(row.profile_id)
  if (!existing) {
    rowsById.set(row.profile_id, row)
    continue
  }
  const member = targets.find((m) => m.profile_id === row.profile_id)
  const existingMember = targets.find((m) => m.profile_id === row.profile_id && m.agency_id === existing.agency_id)
  if (member?.is_owner && !existingMember?.is_owner) {
    rowsById.set(row.profile_id, row) // owner membership wins
  }
}
const deduped = [...rowsById.values()]
if (deduped.length !== rows.length) {
  console.log(`[dedupe] ${rows.length} candidate rows -> ${deduped.length} unique profile(s)`)
}
rows.length = 0
rows.push(...deduped)

if (rows.length === 0) {
  console.log('[backfill] nothing to write (no broker/admin/owner members).')
} else {
  // -------------------------------------------------------------------------
  // Write — try native upsert (requires unique constraint on profile_id),
  // fall back to a merge loop if the conflict target is unavailable.
  // -------------------------------------------------------------------------
  const { error: upsertErr } = await db
    .from('broker_profiles')
    .upsert(rows, { onConflict: 'profile_id' })

  if (!upsertErr) {
    console.log(`[backfill] upserted ${rows.length} broker_profiles (onConflict profile_id)`)
  } else {
    console.warn(`[backfill] native upsert unavailable (${upsertErr.message}) — falling back to merge loop`)
    const { data: existing, error: existingErr } = await db
      .from('broker_profiles')
      .select('id, profile_id')

    if (existingErr) throw new Error(`broker_profiles read failed: ${existingErr.message}`)

    const existingByProfile = new Map(existing.map((e) => [e.profile_id, e]))
    let inserted = 0
    let updated = 0

    for (const row of rows) {
      const found = existingByProfile.get(row.profile_id)
      if (found) {
        const { error: updErr } = await db.from('broker_profiles').update(row).eq('id', found.id)
        if (updErr) throw new Error(`update failed for profile ${row.profile_id}: ${updErr.message}`)
        updated += 1
      } else {
        const { error: insErr } = await db.from('broker_profiles').insert(row)
        if (insErr) throw new Error(`insert failed for profile ${row.profile_id}: ${insErr.message}`)
        inserted += 1
      }
    }

    console.log(`[backfill] merge loop: inserted ${inserted}, updated ${updated}`)
  }
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
const { count, error: countErr } = await db
  .from('broker_profiles')
  .select('*', { count: 'exact', head: true })

if (countErr) throw new Error(`verification count failed: ${countErr.message}`)

const { data: sample, error: sampleErr } = await db
  .from('broker_profiles')
  .select('profile_id, agency_id, public_name, email_public')
  .limit(3)

if (sampleErr) throw new Error(`verification sample failed: ${sampleErr.message}`)

console.log(`[verify] broker_profiles total: ${count}`)
console.log('[verify] sample rows:')
for (const s of sample) console.log(JSON.stringify(s))
