#!/usr/bin/env node
// seed-realistic-listings.mjs — Seed realistic sample listings under EZ Business Advisors
// so the public marketplace looks pitch-ready (replaces visible e2e junk).
// Safe to re-run: skips if the listing_ref already exists.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  env[t.slice(0, i).trim()] = v
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const AGENCY_ID = '354facdb-cce2-4eb0-a160-8454854e731a' // EZ Business Advisors
const AGENT_ID = '597505ff-d47a-431d-97e9-481cc6032018' // EZ broker member

// 5 realistic, anonymized (BizBuySell-style) sample deals — diverse industries/cities/price points.
const SAMPLES = [
  {
    ref: 'EZ-DEMO-001',
    business_name: 'Keystone HVAC & Mechanical Services LLC',
    public_title: 'Profitable HVAC & Mechanical Services Company — Harrisburg, PA',
    industry: 'Business Services',
    sub_industry: 'HVAC & Mechanical',
    location: 'Harrisburg, PA',
    asking: 895000, revenue: 1420000, sde: 312000, ebitda: 268000,
    established: 2004, ft: 9, pt: 2,
    summary: 'Established residential & light-commercial HVAC company in Central PA with a 12-year service history, 9 full-time techs, and strong recurring maintenance-contract revenue. Owner is retiring and will support a 60-day transition.',
    highlights: ['$1.42M annual revenue', '$312K seller discretionary earnings', '1,400+ active maintenance agreements', '9 FT technicians — no owner field work', '60-day owner transition included'],
    reason: 'Owner retiring after 20+ years in the trade',
    city: 'Harrisburg', state: 'PA', exposure: 'city_state',
    show_financials: true, confidential: true, sba: true,
  },
  {
    ref: 'EZ-DEMO-002',
    business_name: 'Susquehanna Car Wash & Detailing',
    public_title: 'Established Car Wash & Detailing Business — York, PA',
    industry: 'Car Wash',
    sub_industry: 'Express + Detail',
    location: 'York, PA',
    asking: 640000, revenue: 780000, sde: 214000, ebitda: 186000,
    established: 2011, ft: 5, pt: 8,
    summary: 'Well-run car wash with a profitable detailing add-on and strong local repeat traffic. Low staffing complexity, mostly equipment-driven revenue, and room to grow membership programs.',
    highlights: ['$780K annual revenue', '$214K seller discretionary earnings', 'Equipment-driven — low labor dependence', 'Prime York County location', 'Membership program upside'],
    reason: 'Owner pursuing a new venture outside the area',
    city: 'York', state: 'PA', exposure: 'city_state',
    show_financials: true, confidential: true, sba: true,
  },
  {
    ref: 'EZ-DEMO-003',
    business_name: 'Lancaster GreenScape Landscaping',
    public_title: 'Landscaping & Snow Removal Company — Lancaster, PA',
    industry: 'Lawn Care',
    sub_industry: 'Landscaping + Snow',
    location: 'Lancaster, PA',
    asking: 375000, revenue: 610000, sde: 168000, ebitda: null,
    established: 2014, ft: 6, pt: 6,
    summary: 'Full-service landscaping and snow-removal business with a loyal residential + commercial route base in Lancaster County. Includes equipment, client contracts, and a trained crew.',
    highlights: ['$610K annual revenue', '$168K seller discretionary earnings', 'Commercial + residential routes', 'Equipment included in sale', 'Seasonal snow revenue diversifies income'],
    reason: 'Owner relocating out of state',
    city: 'Lancaster', state: 'PA', exposure: 'city_state',
    show_financials: true, confidential: true, sba: true,
  },
  {
    ref: 'EZ-DEMO-004',
    business_name: 'Blue Mountain B2B Janitorial',
    public_title: 'Commercial Janitorial Services (B2B Contracts) — Allentown, PA',
    industry: 'Cleaning',
    sub_industry: 'Commercial Janitorial',
    location: 'Allentown, PA',
    asking: 295000, revenue: 520000, sde: 143000, ebitda: 121000,
    established: 2010, ft: 14, pt: 9,
    summary: 'B2B commercial cleaning company servicing office buildings and light-industrial sites across the Lehigh Valley. Recurring contracts, night-shift model, and an experienced crew.',
    highlights: ['$520K annual revenue', '$143K seller discretionary earnings', '95% recurring contract revenue', 'Night-shift ops — day is free', '14 FT + 9 PT staff in place'],
    reason: 'Owner taking a corporate role',
    city: 'Allentown', state: 'PA', exposure: 'city_state',
    show_financials: true, confidential: true, sba: true,
  },
  {
    ref: 'EZ-DEMO-005',
    business_name: 'Keystone Courier & Logistics LLC',
    public_title: 'Regional Courier & Delivery Company — Scranton, PA',
    industry: 'Logistics',
    sub_industry: 'Courier / Last-mile',
    location: 'Scranton, PA',
    asking: 520000, revenue: 890000, sde: 198000, ebitda: 172000,
    established: 2016, ft: 11, pt: 4,
    summary: 'Regional courier and last-mile delivery company with contracted routes and a modern, well-maintained vehicle fleet. Diversified client base across medical, legal, and e-commerce deliveries.',
    highlights: ['$890K annual revenue', '$198K seller discretionary earnings', 'Contracted recurring routes', 'Fleet included', 'Diversified client base'],
    reason: 'Owner pursuing a new opportunity',
    city: 'Scranton', state: 'PA', exposure: 'city_state',
    show_financials: true, confidential: true, sba: true,
  },
]

let created = 0
for (const s of SAMPLES) {
  // Idempotence: skip if a listing with this listing_ref exists
  const { data: existing } = await sb.from('listings').select('id').eq('listing_ref', s.ref).maybeSingle()
  if (existing) {
    console.log(`SKIP ${s.ref} — already exists (${existing.id})`)
    continue
  }
  const now = new Date().toISOString()
  const { data: listing, error: e1 } = await sb.from('listings').insert({
    agency_id: AGENCY_ID,
    agent_id: AGENT_ID,
    business_name: s.business_name,
    headline: s.public_title,
    industry: s.industry,
    sub_industry: s.sub_industry,
    location_general: s.location,
    asking_price: s.asking,
    annual_revenue: s.revenue,
    sde: s.sde,
    ebitda: s.ebitda,
    established_year: s.established,
    employees_full_time: s.ft,
    employees_part_time: s.pt,
    reason_for_sale: s.reason,
    status: 'active',
    review_stage: 'approved',
    published_at: now,
    created_at: now,
    updated_at: now,
    property_city: s.city,
    property_state: s.state,
    confidentiality_level: 'anonymous',
    intake_source: 'broker_manual',
    currency_code: 'USD',
    sba_qualified: s.sba,
    ai_readiness_score: 92,
    ai_metadata: { seed: 'realistic-sample', seed_date: now.slice(0, 10) },
    image_urls: [],
    primary_image_url: null,
    listing_ref: s.ref,
  }).select('id').single()
  if (e1) { console.log(`FAIL ${s.ref}: ${e1.message}`); continue }

  const { data: pl, error: e2 } = await sb.from('public_listings').insert({
    listing_id: listing.id,
    slug: `${slugify(s.public_title)}-${listing.id.slice(0, 8)}`,
    published: true,
    published_at: now,
    is_confidential: s.confidential,
    public_title: s.public_title,
    show_financials: s.show_financials,
    location_exposure: s.exposure,
    public_summary: s.summary,
    public_highlights: s.highlights,
    gallery_json: [],
    revenue_verified: false,
    seller_verified: false,
    is_featured: created < 2,
  }).select('id').single()
  if (e2) { console.log(`FAIL ${s.ref} public row: ${e2.message}`); continue }
  console.log(`CREATED ${s.ref} -> listing ${listing.id} / public ${pl.id}  (${s.public_title})`)
  created++
}
console.log(`Done. Created ${created} realistic listings.`)

function slugify(t) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90)
}
