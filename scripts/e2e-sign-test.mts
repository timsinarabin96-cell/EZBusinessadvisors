// E2E signing test — seed pack templates, create a real document, generate signing links
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { PACK_TEMPLATES } from '../lib/legalPackTemplates.ts'

// Load env from .env.local (manual parse, no dotenv dep)
const env: Record<string, string> = {}
for (const line of fs.readFileSync(path.join(import.meta.dirname, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APP = 'https://concord-deal-platform.vercel.app'

function token(): string {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// 1) Seed missing PACK_TEMPLATES (mirrors /api/documents/templates/ensure)
let created = 0
for (const tpl of PACK_TEMPLATES) {
  const { data: existing } = await db.from('document_templates').select('id').eq('name', tpl.name).maybeSingle()
  if (existing?.id) continue
  const { error } = await db.from('document_templates').insert({
    name: tpl.name, description: tpl.description, category: tpl.category,
    fields: tpl.fields, parties: tpl.parties, body_template: tpl.body_template, is_active: true,
  })
  if (!error) created++
}
console.log('Seeded templates:', created)

// 2) Find the Offer to Purchase & Acceptance template
const { data: tpl } = await db.from('document_templates').select('id').eq('name', 'Offer to Purchase & Acceptance').maybeSingle()
if (!tpl) { console.log('TEMPLATE NOT FOUND'); process.exit(1) }

// 3) Create a document against Lakeside Auto Detailing (real active listing)
const listingId = 'cba005b3-68d1-4d85-8443-ae8f9bb17338'
const { data: listing } = await db.from('listings').select('business_name, asking_price').eq('id', listingId).maybeSingle()
console.log('Listing:', listing?.business_name, listing?.asking_price)

const parties = [
  { key: 'agent', label: 'Broker', role: 'agent', name: null, email: null, license: null, phone: null, title: null },
  { key: 'buyer', label: 'Buyer', role: 'buyer', name: 'Test Buyer', email: 'rtimsina@ezbusinessadvisors.com' },
  { key: 'seller', label: 'Seller', role: 'seller', name: 'Test Seller', email: 'rtimsina@ezbusinessadvisors.com' },
]
const { data: doc, error: docErr } = await db.from('documents').insert({
  template_id: tpl.id, listing_id: listingId, title: 'Draft — Offer: Lakeside Auto Detailing',
  status: 'draft',
  filled_data: {
    business_name: 'Lakeside Auto Detailing', buyer_name: 'Test Buyer', buyer_entity_type: 'Individual',
    seller_name: 'Test Seller', purchase_price: 350000, deposit_amount: 17500,
    closing_date: '2026-10-15', due_diligence_days: 30,
    financing_terms: 'Buyer to secure conventional financing; offer not contingent on financing.',
    included_assets: 'Equipment, inventory, goodwill, client list, trade name, lease assignment.',
    excluded_assets: 'Cash, accounts receivable, real estate.',
    agency_name: 'EZ Business Advisors', broker_name: '',
  },
  parties,
}).select().single()
if (docErr || !doc) { console.log('DOC ERR:', docErr?.message); process.exit(1) }
console.log('Document created:', doc.id)

// Seed signature rows like createDocument does
for (const p of parties) {
  await db.from('document_signatures').insert({
    document_id: doc.id, party_key: p.key, party_name: p.name, party_email: p.email, role: p.role, status: 'unsigned',
  })
}

// 4) Create signing links for the parties WITH emails (agent has none -> skipped, stays blank/fillable)
const links: Array<{ partyKey: string; token: string; url: string }> = []
for (const p of parties) {
  if (!p.email) continue
  const t = token()
  const { error } = await db.from('document_signing_links').insert({
    document_id: doc.id, party_key: p.key, party_name: p.name, party_email: p.email,
    token: t, status: 'pending', expires_at: new Date(Date.now() + 168 * 3600000).toISOString(),
  })
  if (error) { console.log('LINK ERR:', error.message); continue }
  links.push({ partyKey: p.key, token: t, url: `${APP}/sign/${t}` })
}
console.log('LINKS:')
for (const l of links) console.log(`  ${l.partyKey}: ${l.url}`)
console.log('DOC_ID=' + doc.id)
