// Round 4 — RLS table-level probes with user JWTs (the real permission boundary)
// + pipeline stages + certificates + training + audit log + MFA.
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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
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

// RLS probes: what does each role's JWT see in each table (row counts)?
const TABLES = [
  ['listings', `/rest/v1/listings?select=id&limit=1000`],
  ['listings(EZ only)', `/rest/v1/listings?select=id&agency_id=eq.${EZ}&limit=1000`],
  ['listings(HARBOR)', `/rest/v1/listings?select=id&agency_id=eq.${HARBOR}&limit=1000`],
  ['buyer_leads', `/rest/v1/buyer_leads?select=id&limit=1000`],
  ['seller_leads', `/rest/v1/seller_leads?select=id&limit=1000`],
  ['deals', `/rest/v1/deals?select=id&limit=1000`],
  ['commissions', `/rest/v1/commissions?select=id&limit=1000`],
  ['agency_settings', `/rest/v1/agency_settings?select=agency_id&limit=1000`],
  ['licenses', `/rest/v1/licenses?select=id&limit=1000`],
  ['audit_logs', `/rest/v1/audit_logs?select=id&limit=1000`],
  ['legal_vault_entries', `/rest/v1/legal_vault_entries?select=id&limit=1000`],
]
for (const [label, path] of TABLES) {
  const row = [label]
  for (const r of ROLES) {
    const tok = tokens[r.key]
    if (!tok) { row.push('--'); continue }
    try {
      const res = await fetch(`${URL}${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${tok}` } })
      if (res.status !== 200) { row.push(String(res.status)); continue }
      const arr = await res.json()
      row.push(String(arr.length))
    } catch { row.push('ERR') }
  }
  console.log(row.join('\t'))
}

// Service-role truth: total rows per table (what super admin should see)
const q = async (path) => { const r = await fetch(URL + path, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }); return r.json() }
console.log('\n--- service-role truth ---')
for (const [label, path] of [['listings', '/rest/v1/listings?select=id&limit=1000'], ['buyer_leads', '/rest/v1/buyer_leads?select=id&limit=1000'], ['seller_leads', '/rest/v1/seller_leads?select=id&limit=1000'], ['deals', '/rest/v1/deals?select=id&limit=1000'], ['commissions', '/rest/v1/commissions?select=id&limit=1000'], ['audit_logs', '/rest/v1/audit_logs?select=id&limit=1000']]) {
  const arr = await q(path)
  console.log(label, Array.isArray(arr) ? arr.length : JSON.stringify(arr).slice(0, 80))
}
