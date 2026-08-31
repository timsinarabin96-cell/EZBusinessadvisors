// Role gauntlet round 2 — correct shapes + POST mutation probes.
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
const APP = env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'
const PW = 'E2e!Test#2026#Concord'
const AGENCY = '354facdb-cce2-4eb0-a160-8454854e731a'

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
  if (error) { console.log(`SIGNIN FAIL ${r.key}`); continue }
  tokens[r.key] = data.session.access_token
}

// [method, path, body?]
const PROBES = [
  ['GET', `/api/commissions?agencyId=${AGENCY}`],
  ['GET', `/api/closing?agencyId=${AGENCY}&tracked=1`],
  ['GET', `/api/agency/settings?agencyId=${AGENCY}`],
  ['GET', `/api/agency/security?agencyId=${AGENCY}`],
  ['POST', '/api/listings/review', { listingId: '00000000-0000-0000-0000-000000000000', action: 'approve' }],
  ['POST', '/api/agency/members', { agencyId: AGENCY, email: 'x@x.com', role: 'agent' }],
  ['POST', '/api/invites', { agencyId: AGENCY, targetType: 'agent', email: 'x@x.com' }],
  ['POST', '/api/commissions', { agencyId: AGENCY, amount: 100 }],
  ['POST', '/api/billing/convert-trial', { agencyId: AGENCY, planType: 'professional' }],
  ['GET', `/api/billing/license-subscription?agencyId=${AGENCY}`],
  ['GET', '/api/certificates?agencyId=' + AGENCY],
  ['GET', '/api/buyers/pipeline?agencyId=' + AGENCY],
  ['GET', '/api/deals?agencyId=' + AGENCY],
  ['GET', '/api/leads?agencyId=' + AGENCY],
  ['GET', '/api/activity?agencyId=' + AGENCY],
  ['GET', '/api/compliance?agencyId=' + AGENCY],
  ['GET', '/api/team/members?agencyId=' + AGENCY],
  ['GET', '/api/agency/members?agencyId=' + AGENCY],
  ['GET', '/api/owner/listings'],
  ['GET', '/api/review-queue'],
  ['GET', '/api/command-center'],
  ['GET', '/api/performance'],
  ['GET', '/api/marketplace-health'],
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
