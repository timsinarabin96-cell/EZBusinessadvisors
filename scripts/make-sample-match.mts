// Generate sample PDFs for the rebuilt Marketing Agreement + Offer & Acceptance
// templates using the SAME renderer that ships (lib/documentPdf.server.ts),
// so what the boss reviews is byte-for-byte what production produces.
import { writeFileSync } from 'fs'
import { PACK_TEMPLATES } from '../lib/legalPackTemplates.ts'
import { buildDocumentPdfBase64 } from '../lib/documentPdf.server.ts'

const AGENCY = 'EZ Business Advisors'
const LOGO = '/brand/ez-business-advisors.jpg'

async function render(templateName: string, title: string, filled: Record<string, unknown>) {
  const tpl = PACK_TEMPLATES.find((t) => t.name === templateName)
  if (!tpl) throw new Error(`template not found: ${templateName}`)
  const parties = (tpl.parties || []).map((p: { key?: string; label?: string; role?: string }) => {
    if (p.role === 'agent') return { ...p, name: 'Rabin Timsina', email: 'rabin@ezbusinessadvisors.com', phone: '(717) 706-7457', title: 'Business Broker' }
    if (p.role === 'seller') return { ...p, name: 'Rabin Timsina & Upendra Adhikari', email: 'seller@brothersbev.com' }
    if (p.role === 'buyer') return { ...p, name: 'Pampha Chhetri', email: 'pampha@example.com' }
    return { ...p, name: 'Signed' }
  })
  const b64 = await buildDocumentPdfBase64(
    { title, body_template: tpl.body_template, filled_data: filled, parties },
    { agencyName: AGENCY, agencyLogoUrl: LOGO },
  )
  const out = `/tmp/sample-${templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
  writeFileSync(out, Buffer.from(b64, 'base64'))
  console.log('WROTE', out)
}

// ── Marketing Agreement — mirrors boss's Brothers Beverages sample ──────────
await render(
  'Marketing Agreement',
  'MARKETING AGREEMENT',
  {
    business_name: 'Derry Beverage',
    title: 'MARKETING AGREEMENT',
    legal_entity: 'Brothers Beverages LLC',
    business_address: '1624 Continental Blvd',
    city: 'Washingtonville', state: 'PA', zip: '17884',
    owner_names: 'Rabin Timsina & Upendra Adhikari',
    cell_phone: '(570) 555-0134',
    private_email: 'rabin@brothersbev.com',
    non_compete_radius: 30, non_compete_years: 3,
    training_weeks: 2,
    inventory_value: 25000, ffe_value: 25000, leasehold_value: 25000,
    annual_sales: 600000, sde: 72000,
    asking_price: 220000, down_payment: 220000,
    seller_note: 'Not Applicable', interest_rate: 'NA',
    monthly_payment: 'Not Applicable', note_months: 'NA',
    additional_provisions: 'None.',
    commission_rate: 6, minimum_commission: 10000,
    term_months: 12, tail_months: 24,
    agreement_date: 'June 11, 2020',
    agency_name: AGENCY, broker_name: 'Rabin Timsina',
  },
)

// ── Offer & Acceptance — mirrors boss's Glamour Threading sample ────────────
await render(
  'Offer to Purchase & Acceptance',
  'BUSINESS SALE OFFER AND ACCEPTANCE AGREEMENT',
  {
    business_name: 'Glamour Threading',
    title: 'BUSINESS SALE OFFER AND ACCEPTANCE AGREEMENT',
    business_address: '105 Gateway Dr, Mechanicsburg, PA 17050',
    seller_name: 'Roma Dhungana',
    seller_entity: 'Glamour Threading LLC',
    seller_address: '105 Gateway Dr, Mechanicsburg, PA 17050',
    seller_phone: '(717) 628-3792',
    buyer_name: 'Pampha Chhetri',
    buyer_address: '301 N Progress Ave, Harrisburg, PA 76131',
    buyer_phone: '(510) 287-6364',
    total_purchase_price: 56000,
    deposit_amount: 15000,
    additional_deposit: 'Not Applicable',
    cash_at_closing: 49000,
    note_amount: 'Not Applicable',
    note_interest_rate: 'NA',
    note_monthly_payment: 'Not Applicable',
    closing_date: 'February 15, 2023',
    due_diligence_days: 10,
    lease_contingency: 'Assignment of existing lease',
    inventory_amount: 'Not Applicable',
    non_compete_months: 12, non_compete_radius: 30,
    training_days: 5,
    liabilities_assumed: 'Not Applicable',
    holdback_amount: 10000, holdback_days: 10,
    contract_review_days: 5,
    offer_expiry_date: 'January 15, 2023',
    agency_name: AGENCY, broker_name: 'Rabin Timsina',
  },
)
