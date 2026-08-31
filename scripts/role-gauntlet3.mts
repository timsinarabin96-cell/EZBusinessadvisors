// Role gauntlet round 3 — real listing IDs, cross-tenant, review queue, owner isolation.
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
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APP = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'
const PW = 'E2e!Test#2026#Concord'
const EZ = '354facdb-cce2-4eb0-a160-8454854e731a'
const HARBOR = '78c63194-9755-495d-b091-560d985001ef'

const ROLES = [
  { key: 'owner', email: 'owner@ezbusinessadvisors.com' },
  { key: 'agent', email: 'agent@ezbusinessadvisors.com' },
  { key: 'broker', email: 'broker@ezbusinessadvisors.com' },
  { key: 'admin', email: 'admin@ezbusinessadvisors.com' },
]
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const tokens = {}
for (const r of ROLES) {
  const { data, error } = await anon.auth.signInWithPassword({ email: r.email, password: PW })
  if (error) { console.log(`SIGNIN FAIL ${r.key}: ${error.message}`); continue }
  tokens[r.key] = data.session.access_token
}

// Real listings: EZ draft (own), Harbor active (foreign), EZ active.
const rest = async (path) => {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  return r.json()
}
const ezListings = await rest(`/listings?select=id,business_name,status,review_stage,owner_email&agency_id=eq.${EZ}&limit=5`)
const harborListings = await rest(`/listings?select=id,business_name,status&agency_id=eq.${HARBOR}&limit=3`)
const ezOwn = ezListings?.[0]?.id || ''
const harborOwn = harborListings?.[0]?.id || ''
console.log('EZ sample:', ezListings?.[0]?.business_name, ezOwn.slice(0, 8), '| Harbor sample:', harborListings?.[0]?.business_name, harborOwn.slice(0, 8))

// [method, path, body?]
const PROBES = [
  // Review queue: broker/admin approve own-agency draft; broker cross-tenant reject → expect 403
  ['POST', '/api/listings/review', { listingId: ezOwn, action: 'approve' }],
  ['POST', '/api/listings/review', { listingId: harborOwn, action: 'reject' }],
  // Read a foreign listing detail as each role (cross-tenant isolation)
  ['GET', `/api/listings/${harborOwn}`],
  ['GET', `/api/listings/${ezOwn}`],
  // Commissions: broker seeing agency numbers (walkthrough item)
  ['GET', `/api/commissions?agencyId=${EZ}`],
  // Pipeline / deals
  ['GET', `/api/deals/build?listingId=${ezOwn}`],
  // Closing tracker own agency vs foreign agency
  ['GET', `/api/closing?agencyId=${EZ}&tracked=1`],
  ['GET', `/api/closing?agencyId=${HARBOR}&tracked=1`],
  // Team / members list (find real route)
  ['GET', `/api/agency/members?agencyId=${EZ}`],
  // Training / certificates
  ['GET', `/api/certificates?agencyId=${EZ}`],
  ['GET', `/api/certificates`],
  // Marketplace health + AI usage (admin dashboards)
  ['GET', '/api/admin/marketplace-health'],
  ['GET', '/api/admin/ai'],
  // Owner: their own listing status endpoint
  ['GET', `/api/owner/listings/${ezOwn}/status`],
]

for (const [method, path, body] of PROBES) {
  const row = [`${method} ${path.split('?')[0]}`]
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
    } catch { row.push('ERR') }
  }
  console.log(row.join('\t'))
}
