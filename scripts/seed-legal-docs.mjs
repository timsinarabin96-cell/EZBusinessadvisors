// =============================================================================
// Seed the brokerage legal pack into document_templates
// Usage: node scripts/seed-legal-docs.mjs
// Adds Boss's forms: Marketing Agreement, LLC Resolution, Corporate Resolution,
// Buyer Profile, Due Diligence Checklist, Property Addendum (+ keeps the
// existing NDA / Listing Agreement / Purchase Agreement). Idempotent.
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

// Fixed UUIDs so re-seeding is idempotent.
const TEMPLATES = [
  {
    id: 'd0c00000-0001-4000-8000-000000000001',
    name: 'Marketing Agreement',
    description: 'Exclusive engagement authorizing the broker to market and sell the business. Signed by broker and every seller.',
    category: 'Marketing Agreement',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'seller_entity', label: 'Seller Entity', type: 'text', required: true, placeholder: 'e.g. ABC Holdings, LLC' },
      { key: 'asking_price', label: 'Asking Price', type: 'number', required: true, placeholder: '500000' },
      { key: 'commission_rate', label: 'Commission Rate %', type: 'number', required: true, placeholder: '10' },
      { key: 'term_months', label: 'Term (months)', type: 'number', required: true, placeholder: '12' },
      { key: 'exclusive', label: 'Exclusive', type: 'select', required: true, options: ['Yes', 'No'], placeholder: '' },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true, placeholder: '' },
      { key: 'agency_name', label: 'Agency Name', type: 'text', required: false, placeholder: 'Your brokerage' },
      { key: 'property_included', label: 'Real Property Included?', type: 'select', required: true, options: ['No', 'Yes — see Property Addendum'], placeholder: '' },
    ],
    parties: [
      { key: 'agent', label: 'Broker / Agency', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'seller2', label: 'Co-Seller (if any)', role: 'seller' },
    ],
    body_template: 'MARKETING AGREEMENT\n\nEffective Date: {{effective_date}}\n\nThis Marketing Agreement (the "Agreement") is entered into by and between {{agency_name}} ("Broker") and {{seller_entity}} ("Seller") for the exclusive {{exclusive.toLowerCase() === "yes" ? "exclusive" : "non-exclusive"}} right to market and sell {{business_name}}.\n\nAsking Price: {{asking_price}}\nCommission Rate: {{commission_rate}}%\nTerm: {{term_months}} months\nReal Property Included: {{property_included}}\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.',
  },
  {
    id: 'd0c00000-0002-4000-8000-000000000002',
    name: 'LLC Resolution',
    description: 'Member resolution authorizing the sale of the company or its assets. One signature slot per member.',
    category: 'Corporate Documents',
    fields: [
      { key: 'company_name', label: 'LLC Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'state', label: 'State of Formation', type: 'text', required: true, placeholder: 'e.g. Texas' },
      { key: 'business_name', label: 'Business Being Sold', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'resolution_date', label: 'Resolution Date', type: 'date', required: true, placeholder: '' },
      { key: 'authorized_price', label: 'Authorized Minimum Price', type: 'number', required: true, placeholder: '500000' },
    ],
    parties: [
      { key: 'member1', label: 'Member 1', role: 'seller' },
      { key: 'member2', label: 'Member 2 (if any)', role: 'seller' },
      { key: 'member3', label: 'Member 3 (if any)', role: 'seller' },
    ],
    body_template: 'LLC MEMBER RESOLUTION\n\n{{company_name}}, a {{state}} limited liability company\n\nRESOLVED, that the members of {{company_name}} authorize the sale of {{business_name}} for no less than {{authorized_price}}, and authorize the managers to execute all necessary documents to effect the sale.\n\nAdopted: {{resolution_date}}',
  },
  {
    id: 'd0c00000-0003-4000-8000-000000000003',
    name: 'Corporate Resolution',
    description: 'Board of directors resolution authorizing the sale. One signature slot per director.',
    category: 'Corporate Documents',
    fields: [
      { key: 'company_name', label: 'Corporation Name', type: 'text', required: true, placeholder: 'e.g. ABC Corporation' },
      { key: 'state', label: 'State of Incorporation', type: 'text', required: true, placeholder: 'e.g. Delaware' },
      { key: 'business_name', label: 'Business Being Sold', type: 'text', required: true, placeholder: 'e.g. ABC Corporation' },
      { key: 'resolution_date', label: 'Resolution Date', type: 'date', required: true, placeholder: '' },
      { key: 'authorized_price', label: 'Authorized Minimum Price', type: 'number', required: true, placeholder: '500000' },
    ],
    parties: [
      { key: 'director1', label: 'Director 1', role: 'seller' },
      { key: 'director2', label: 'Director 2 (if any)', role: 'seller' },
      { key: 'director3', label: 'Director 3 (if any)', role: 'seller' },
    ],
    body_template: 'BOARD RESOLUTION\n\n{{company_name}}, a {{state}} corporation\n\nRESOLVED, that the Board of Directors of {{company_name}} authorizes the sale of {{business_name}} for no less than {{authorized_price}}, and authorizes the officers to execute all necessary documents to effect the sale.\n\nAdopted: {{resolution_date}}',
  },
  {
    id: 'd0c00000-0004-4000-8000-000000000004',
    name: 'Buyer Profile',
    description: 'Buyer qualification profile — filled by the buyer, reviewed by the broker.',
    category: 'Buyer Documents',
    fields: [
      { key: 'buyer_name', label: 'Buyer Full Name', type: 'text', required: true, placeholder: 'e.g. John Smith' },
      { key: 'buyer_entity', label: 'Buyer Entity (if any)', type: 'text', required: false, placeholder: 'e.g. Smith Holdings LLC' },
      { key: 'industry_pref', label: 'Target Industries', type: 'text', required: true, placeholder: 'e.g. Manufacturing, distribution' },
      { key: 'price_range_min', label: 'Budget Min ($)', type: 'number', required: true, placeholder: '200000' },
      { key: 'price_range_max', label: 'Budget Max ($)', type: 'number', required: true, placeholder: '1000000' },
      { key: 'experience', label: 'Industry Experience', type: 'textarea', required: true, placeholder: 'Describe relevant background' },
      { key: 'funding', label: 'Funding Source', type: 'text', required: true, placeholder: 'e.g. SBA 7(a), cash, seller note' },
      { key: 'timeline', label: 'Target Timeline', type: 'text', required: true, placeholder: 'e.g. 3-6 months' },
      { key: 'profile_date', label: 'Profile Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
      { key: 'agent', label: 'Broker', role: 'agent' },
    ],
    body_template: 'BUYER PROFILE\n\nDate: {{profile_date}}\n\nBuyer: {{buyer_name}} ({{buyer_entity}})\nTarget Industries: {{industry_pref}}\nBudget: {{price_range_min}} – {{price_range_max}}\nExperience: {{experience}}\nFunding: {{funding}}\nTimeline: {{timeline}}\n\nI confirm the information above is accurate and I am prepared to provide proof of funds upon request.',
  },
  {
    id: 'd0c00000-0005-4000-8000-000000000005',
    name: 'Due Diligence Checklist',
    description: 'Standard due diligence checklist shared with the buyer after LOI.',
    category: 'Buyer Documents',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'checklist_date', label: 'Date', type: 'date', required: true, placeholder: '' },
      { key: 'diligence_days', label: 'Diligence Period (days)', type: 'number', required: true, placeholder: '30' },
    ],
    parties: [
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: 'DUE DILIGENCE CHECKLIST\n\nBusiness: {{business_name}}\nDate: {{checklist_date}}\nDiligence Period: {{diligence_days}} days\n\n1. Three years of tax returns and P&Ls\n2. Balance sheets (3 years)\n3. Lease agreement(s)\n4. FFE (furniture, fixtures, equipment) list\n5. Customer concentration report\n6. Employee roster + compensation\n7. Material contracts and licenses\n8. Real estate details (if included)\n9. Insurance policies\n10. Pending litigation / liabilities\n\nBoth parties acknowledge the above checklist governs the diligence period.',
  },
  {
    id: 'd0c00000-0006-4000-8000-000000000006',
    name: 'Property Addendum',
    description: 'Addendum when the business is sold together with real property.',
    category: 'Marketing Agreement',
    fields: [
      { key: 'business_name', label: 'Business Name', type: 'text', required: true, placeholder: 'e.g. ABC Manufacturing LLC' },
      { key: 'property_address', label: 'Property Address', type: 'text', required: true, placeholder: 'e.g. 123 Industrial Blvd' },
      { key: 'property_value', label: 'Property Value', type: 'number', required: true, placeholder: '750000' },
      { key: 'sale_type', label: 'Sale Type', type: 'select', required: true, options: ['Asset + Real Estate', 'Stock + Real Estate'], placeholder: '' },
      { key: 'addendum_date', label: 'Date', type: 'date', required: true, placeholder: '' },
    ],
    parties: [
      { key: 'seller', label: 'Seller', role: 'seller' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: 'PROPERTY ADDENDUM\n\nBusiness: {{business_name}}\nProperty: {{property_address}}\nProperty Value: {{property_value}}\nSale Type: {{sale_type}}\n\nThis addendum confirms the real property at the above address is included in the sale of {{business_name}}.\n\nDate: {{addendum_date}}',
  },
]

console.log(`Upserting ${TEMPLATES.length} legal templates…`)
const { error } = await db.from('document_templates').upsert(
  TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    fields: t.fields,
    parties: t.parties,
    body_template: t.body_template,
    is_active: true,
  })),
  { onConflict: 'id' },
)
if (error) throw new Error('template upsert failed: ' + error.message)

const { data, error: qErr } = await db.from('document_templates').select('name, category').order('name')
if (qErr) throw new Error('verify failed: ' + qErr.message)

console.log('\n✅ LEGAL PACK SEEDED')
data.forEach((t) => console.log(`  • ${t.name} (${t.category})`))
