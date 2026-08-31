// Role gauntlet — provision test accounts + probe deployed API per role.
// Resets passwords on the four TEST accounts (owner/agent/broker/admin),
// signs in as each, then hits a battery of permission-sensitive endpoints
// against the deployed app and records status codes.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((l) => l && !l.trimStart().startsWith('#') && l.includes('=')).map((l) => {
    const i = l.indexOf('='); const k = l.slice(0, i).trim(); let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    return [k, v]
  }),
)

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const APP = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'
const PW = 'E2e!Test#2026#Concord'

const ROLES = [
  { key: 'owner',  email: 'owner@ezbusinessadvisors.com' },
  { key: 'agent',  email: 'agent@ezbusinessadvisors.com' },
  { key: 'broker', email: 'broker@ezbusinessadvisors.com' },
  { key: 'admin',  email: 'admin@ezbusinessadvisors.com' },
]

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

// 1) Reset passwords (test accounts only) via raw admin REST (listUsers paginates).
const USER_IDS = {
  owner: '67d49624-95c1-4aaa-8c3b-e8a045abac4d',
  agent: '4cdf3a14-882c-4a48-b1ef-30049fdfad51',
  broker: '597505ff-d47a-431d-97e9-481cc6032018',
  admin: '822c49a5-99e4-4c14-94e5-8f923c8ad82c',
}
for (const r of ROLES) {
  const uid = USER_IDS[r.key]
  if (!uid) { console.log(`MISSING USER ID: ${r.email}`); continue }
  const res = await fetch(`${URL}/auth/v1/admin/users/${uid}`, {
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  })
  const j = await res.json().catch(() => ({}))
  console.log(`provisioned ${r.key}: ${res.ok ? 'ok' : 'ERR ' + (j.msg || res.status)}`)
}

// 2) Sign in + collect tokens.
const tokens = {}
for (const r of ROLES) {
  const { data, error } = await anon.auth.signInWithPassword({ email: r.email, password: PW })
  if (error || !data.session) { console.log(`SIGNIN FAIL ${r.key}: ${error?.message}`); continue }
  tokens[r.key] = data.session.access_token
  console.log(`signed in ${r.key} (${r.email})`)
}

// 3) Probe matrix: [method, path, body?]
const PROBES = [
  ['GET', '/api/listings'],
  ['GET', '/api/leads'],
  ['GET', '/api/deals'],
  ['GET', '/api/commissions'],
  ['GET', '/api/billing/license-subscription'],
  ['POST', '/api/billing/convert-trial', { agencyId: '354facdb-cce2-4eb0-a160-8454854e731a', planType: 'professional' }],
  ['GET', '/api/agency/settings'],
  ['GET', '/api/agency/members'],
  ['GET', '/api/agency/security'],
  ['GET', '/api/admin/overview'],
  ['GET', '/api/admin/agencies'],
  ['GET', '/api/admin/users'],
  ['GET', '/api/admin/audit'],
  ['GET', '/api/admin/legal-vault'],
  ['GET', '/api/admin/marketplace-health'],
  ['GET', '/api/admin/ai'],
  ['GET', '/api/admin/white-label'],
  ['GET', '/api/admin/subscriptions'],
  ['GET', '/api/admin/expenses'],
  ['GET', '/api/compliance'],
  ['GET', '/api/certificates'],
  ['GET', '/api/closing'],
  ['GET', '/api/buyers/pipeline'],
  ['GET', '/api/listings/review'],
  ['GET', '/api/auth/mfa-status'],
  ['GET', '/api/team'],
  ['GET', '/api/invites'],
]

for (const [method, path, body] of PROBES) {
  const row = [`${method} ${path}`]
  for (const r of ROLES) {
    const tok = tokens[r.key]
    if (!tok) { row.push('--'); continue }
    try {
      const res = await fetch(`${APP}${path}`, {
        method,
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      row.push(String(res.status))
    } catch (e) { row.push('ERR') }
  }
  console.log(row.join('\t'))
}
console.log('\nAPP:', APP)
