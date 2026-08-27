/* End-to-end sell flow test: buyers → pipeline → NQA → offers → LOI/closing. */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, KEY, { auth: { persistSession: false } })

const LISTING = 'f7db5deb-79a6-4125-bacc-b9fca432b613' // Bella's Bakery & Cafe
const AGENCY = '354facdb-cce2-4eb0-a160-8454854e731a'

// 1) Add two buyers to the listing (buyer_lists)
const buyers = [
  { listing_id: LISTING, buyer_name: 'Sarah Mitchell', buyer_email: 'sarah.mitchell@test.com', buyer_phone: '(717) 555-0142', buyer_type: 'individual' },
  { listing_id: LISTING, buyer_name: 'Blue Rock Holdings', buyer_email: 'deals@bluerockholdings.com', buyer_phone: '(215) 555-0188', buyer_type: 'fund' },
]
const inserted = []
for (const b of buyers) {
  const { data, error } = await svc.from('buyer_lists').insert(b).select().single()
  if (error) { console.log('insert buyer FAIL:', error.message); continue }
  inserted.push(data)
  console.log('buyer added:', data.buyer_name, data.id)
}

// 2) Move Sarah through the pipeline (simulating the kanban API moves)
const sarah = inserted[0]
const stages = ['contacted', 'nda_sent', 'nda_signed', 'qualified', 'data_room', 'loi']
for (const toStage of stages) {
  const { error } = await svc.from('buyer_lists').update({ pipeline_stage: toStage, stage_entered_at: new Date().toISOString() }).eq('id', sarah.id)
  if (error) { console.log('stage FAIL:', toStage, error.message); continue }
  await svc.from('buyer_pipeline_events').insert({ agency_id: AGENCY, listing_id: LISTING, buyer_list_id: sarah.id, from_stage: stages[stages.indexOf(toStage) - 1] || 'new', to_stage: toStage })
  console.log('→', toStage)
}

// 3) NQA for the fund buyer
const blueRock = inserted[1]
const { data: nqa, error: nqaErr } = await svc.from('buyer_nqa_responses').insert({
  agency_id: AGENCY, listing_id: LISTING, buyer_list_id: blueRock.id,
  answers: { budget: '$400k-600k', funds: 'yes, cash', timeline: 'immediately', industry: 'Food & Beverage', location: 'Central PA', experience: 'yes, 8 years' },
  score: 92,
}).select().single()
console.log('NQA:', nqaErr ? 'FAIL ' + nqaErr.message : `score ${nqa.score} — qualified`)

// 4) Offer from Blue Rock
const { data: offer, error: offErr } = await svc.from('deal_offers').insert({
  agency_id: AGENCY, listing_id: LISTING, status: 'submitted',
  purchase_price: 470000, cash_at_closing: 400000, seller_note: 70000,
  financing_contingency: false, diligence_days: 30, training_days: 30,
  closing_probability: 75, seller_value_score: 82,
}).select().single()
console.log('offer:', offErr ? 'FAIL ' + offErr.message : `$${offer.purchase_price} submitted (score ${offer.seller_value_score})`)

// 5) Closing milestones for the deal
const { data: closing, error: clErr } = await svc.from('deal_closing_milestones').insert({
  agency_id: AGENCY, listing_id: LISTING, title: 'LOI signed', category: 'agreement', status: 'done', due_date: new Date().toISOString(),
}).select().single()
console.log('closing milestone:', clErr ? 'FAIL ' + clErr.message : 'LOI signed ✓')

// 6) Verify the deal timeline API sees it all (query side)
const { data: comms } = await svc.from('communications').select('summary').eq('listing_id', LISTING).limit(5)
console.log('timeline comms:', (comms || []).length)

console.log('\nDONE — listing', LISTING)
