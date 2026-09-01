// =============================================================================
// verify-fd-rls.cjs — live-DB probe for the financial_documents RLS hardening
// (harden_financial_documents_metadata_rls.sql).
//
// Proves, with real user sessions against the LIVE database:
//   ✅ Agency member of the owning agency CAN read financial_documents rows
//   ✅ Cross-agency authenticated user CANNOT read another agency's rows
//   ✅ Authenticated buyer WITHOUT an approved NDA CANNOT read any rows
//   ✅ Authenticated buyer WITH an approved NDA sees ONLY visible_to_buyer docs
//   ✅ Anonymous CANNOT read any rows
//   ✅ Cross-agency user CANNOT insert/update/delete another agency's rows
//
// Uses the same e2e tenant accounts as the confidentiality specs
// (QA Test Brokerage + Harbor Acquisitions).
// =============================================================================
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const crypto = require('crypto')

const raw = fs.readFileSync('.env.local', 'utf8')
const env = {}
for (const line of raw.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').replace(/^'|'$/g, '')
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) { console.error('Missing env keys'); process.exit(1) }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

const QA = { email: process.env.E2E_EMAIL || 'e2e.qa@concordplatform.dev', pass: process.env.E2E_PASSWORD || 'E2e!Test#2026#Concord' }
const HARBOR = {
  agent: { email: process.env.TENANT_AGENT_EMAIL || 'harbor.agent@tenant.test', pass: process.env.TENANT_PASSWORD || 'Tenant!Test#2026#Concord' },
  buyer: { email: process.env.TENANT_BUYER_EMAIL || 'harbor.buyer@tenant.test', pass: process.env.TENANT_PASSWORD || 'Tenant!Test#2026#Concord' },
}

let pass = 0, fail = 0
const ok = (label) => { pass++; console.log('  ✅', label) }
const bad = (label, e) => { fail++; console.log('  ❌', label, '—', (e && (e.message || JSON.stringify(e))) || '') }

async function anonClient() {
  return createClient(URL, ANON, { auth: { persistSession: false } })
}
async function signIn(email, password) {
  const c = await anonClient()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
  return c
}
async function selectRows(client, listingId) {
  const { data, error } = await client
    .from('financial_documents')
    .select('id, file_name, listing_id, visible_to_buyer, uploaded_by')
    .eq('listing_id', listingId)
  if (error) throw new Error(`select: ${error.message}`)
  return data || []
}
async function insertRow(client, row) {
  const { data, error } = await client.from('financial_documents').insert(row).select('id')
  if (error) return { error }
  return { id: data?.[0]?.id }
}
async function updateRow(client, id, patch) {
  const { error } = await client.from('financial_documents').update(patch).eq('id', id)
  return { error }
}
async function deleteRow(client, id) {
  const { error } = await client.from('financial_documents').delete().eq('id', id)
  return { error }
}

;(async () => {
  const R = crypto.randomBytes(3).toString('hex')
  console.log('\n=== FINANCIAL_DOCUMENTS RLS PROBE (live DB) ===\n')

  // ---- Pre-clean any leftover probe fixtures from prior/crashed runs ----
  try {
    const { data: staleDocs } = await svc.from('financial_documents').select('id').like('file_name', 'rls-probe-%')
    if (staleDocs?.length) await svc.from('financial_documents').delete().in('id', staleDocs.map((d) => d.id))
  } catch { /* ignore */ }
  try {
    const { data: staleNdas } = await svc.from('data_room_access_requests').select('id').eq('requester_name', 'RLS Probe Buyer')
    if (staleNdas?.length) await svc.from('data_room_access_requests').delete().in('id', staleNdas.map((n) => n.id))
  } catch { /* ignore */ }

  // ---- Fixture: find QA agency WITH a listing, create two probe docs ----
  const { data: qaAgencies } = await svc.from('agencies').select('id, name').ilike('name', '%QA Test%')
  if (!qaAgencies?.length) { console.error('❌ QA Test Brokerage agency not found — fixture unavailable'); process.exit(1) }
  const qaAgencyIds = qaAgencies.map((a) => a.id)
  const { data: qaListings } = await svc.from('listings').select('id, business_name, agency_id').in('agency_id', qaAgencyIds).limit(1)
  const qaListing = qaListings?.[0]
  if (!qaListing) { console.error('❌ no QA listing found for fixture (tried agencies', qaAgencyIds.length, ')'); process.exit(1) }
  const qaAgency = qaAgencies.find((a) => a.id === qaListing.agency_id) || qaAgencies[0]
  console.log(`Fixture: agency="${qaAgency?.name || qaListing.agency_id}" listing="${qaListing.business_name}" (${qaListing.id.slice(0, 8)}…)`)

  const docHidden = { listing_id: qaListing.id, file_name: `rls-probe-hidden-${R}.pdf`, file_url: 'https://placehold.co/1x1', storage_path: `probe/${R}/hidden.pdf`, status: 'pending', visible_to_buyer: false }
  const docShared = { listing_id: qaListing.id, file_name: `rls-probe-shared-${R}.pdf`, file_url: 'https://placehold.co/1x1', storage_path: `probe/${R}/shared.pdf`, status: 'pending', visible_to_buyer: true }

  const { data: insHidden, error: errHidden } = await svc.from('financial_documents').insert(docHidden).select('id').single()
  const { data: insShared, error: errShared } = await svc.from('financial_documents').insert(docShared).select('id').single()
  if (errHidden || errShared) { console.error('❌ fixture insert failed', errHidden || errShared); process.exit(1) }
  const hiddenId = insHidden.id, sharedId = insShared.id
  console.log(`Fixture docs: hidden=${hiddenId.slice(0, 8)} shared=${sharedId.slice(0, 8)}\n`)

  // ---- 1. Agency member (QA) sees BOTH ----
  try {
    const qa = await signIn(QA.email, QA.pass)
    const rows = await selectRows(qa, qaListing.id)
    const ids = rows.map((r) => r.id)
    ids.includes(hiddenId) && ids.includes(sharedId) ? ok('QA agency member sees both probe docs') : bad(`QA sees ${rows.length} docs`, { got: ids })
  } catch (e) { bad('QA sign-in/select', e) }

  // ---- 2. Cross-agency (Harbor agent) sees NOTHING ----
  try {
    const hAgent = await signIn(HARBOR.agent.email, HARBOR.agent.pass)
    const rows = await selectRows(hAgent, qaListing.id)
    rows.length === 0 ? ok('cross-agency Harbor agent sees 0 QA docs') : bad(`Harbor agent sees ${rows.length} rows`, rows.map((r) => r.file_name))
  } catch (e) { bad('Harbor agent sign-in/select', e) }

  // ---- 3. Buyer WITHOUT NDA sees NOTHING (even shared docs) ----
  try {
    const hBuyer = await signIn(HARBOR.buyer.email, HARBOR.buyer.pass)
    const rows = await selectRows(hBuyer, qaListing.id)
    rows.length === 0 ? ok('no-NDA buyer sees 0 QA docs (incl. visible_to_buyer=true)') : bad(`no-NDA buyer sees ${rows.length} rows`, rows.map((r) => r.file_name))
  } catch (e) { bad('no-NDA buyer sign-in/select', e) }

  // ---- 4. Buyer WITH approved NDA sees ONLY the visible_to_buyer doc ----
  try {
    const hBuyer = await signIn(HARBOR.buyer.email, HARBOR.buyer.pass)
    const buyerEmail = HARBOR.buyer.email
    const { data: reqIns } = await svc.from('data_room_access_requests').insert({
      agency_id: qaAgency.id, listing_id: qaListing.id,
      requester_name: 'RLS Probe Buyer', requester_email: buyerEmail,
      nda_signature: 'RLS Probe', status: 'approved',
    }).select('id').single()
    const rows = await selectRows(hBuyer, qaListing.id)
    const ids = rows.map((r) => r.id)
    const seesShared = ids.includes(sharedId)
    const seesHidden = ids.includes(hiddenId)
    seesShared && !seesHidden ? ok('NDA-approved buyer sees shared doc only (hidden doc blocked)') : bad(`NDA buyer sees shared=${seesShared} hidden=${seesHidden}`, { got: rows.map((r) => r.file_name) })
    if (reqIns) { try { await svc.from('data_room_access_requests').delete().eq('id', reqIns.id) } catch { /* cleanup */ } }
  } catch (e) { bad('NDA-approved buyer probe', e) }

  // ---- 5. Anonymous sees NOTHING ----
  try {
    const anon = await anonClient()
    const rows = await selectRows(anon, qaListing.id)
    rows.length === 0 ? ok('anonymous sees 0 docs') : bad(`anonymous sees ${rows.length} rows`)
  } catch (e) { bad('anonymous probe', e) }

  // ---- 6. Cross-agency CANNOT insert/update/delete QA docs ----
  try {
    const hAgent = await signIn(HARBOR.agent.email, HARBOR.agent.pass)
    const ins = await insertRow(hAgent, { listing_id: qaListing.id, file_name: `rls-probe-intruder-${R}.pdf`, file_url: 'x', status: 'pending' })
    if (ins.error) ok('cross-agency INSERT blocked')
    else { bad('cross-agency INSERT was allowed', ins.id); try { await svc.from('financial_documents').delete().eq('id', ins.id) } catch { /* cleanup */ } }

    // RLS-filtered writes return NO error (0 rows affected) — so verify by EFFECT:
    // after the intruder update/delete attempts, the row must be unchanged & present.
    await updateRow(hAgent, hiddenId, { notes: 'intruder' })
    await deleteRow(hAgent, hiddenId)

    const { data: after } = await svc.from('financial_documents').select('id, notes, status').in('id', [hiddenId, sharedId])
    const hiddenAfter = (after || []).find((r) => r.id === hiddenId)
    const sharedAfter = (after || []).find((r) => r.id === sharedId)

    if (hiddenAfter && hiddenAfter.notes !== 'intruder' && hiddenAfter.status === 'pending') ok('cross-agency UPDATE blocked (row unchanged)')
    else bad('cross-agency UPDATE was allowed', hiddenAfter)

    if (hiddenAfter && sharedAfter) ok('cross-agency DELETE blocked (rows still present)')
    else bad('cross-agency DELETE was allowed', { hiddenAfter, sharedAfter })

    // sanity: probe rows still exist for the agency member
    const qa = await signIn(QA.email, QA.pass)
    const rows = await selectRows(qa, qaListing.id)
    const stillThere = rows.some((r) => r.id === hiddenId) && rows.some((r) => r.id === sharedId)
    stillThere ? ok('QA member still sees both docs after intruder attempts') : bad('QA docs missing after intruder attempts')
  } catch (e) { bad('intruder insert/update/delete probe', e) }

  // ---- Cleanup fixture ----
  try { await svc.from('financial_documents').delete().in('id', [hiddenId, sharedId]) } catch { /* cleanup */ }

  console.log(`\nRESULT: ${pass} passed · ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('fatal:', e); process.exit(1) })
