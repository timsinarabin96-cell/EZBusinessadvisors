/* End-to-end listing flow test — drives the REAL publish code path. */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, KEY, { auth: { persistSession: false } })

const LISTINGS = [
  { id: 'f7db5deb-79a6-4125-bacc-b9fca432b613', name: "Bella's Bakery & Cafe" },
  { id: '3104c1b5-454b-4f5c-a111-8b8423e76f48', name: 'Summit Plumbing Services' },
  { id: 'cba005b3-68d1-4d85-8443-ae8f9bb17338', name: 'Lakeside Auto Detailing' },
]

for (const l of LISTINGS) {
  console.log(`\n=== ${l.name} (${l.id}) ===`)
  const { data: before } = await svc.from('listings').select('id, status, review_stage').eq('id', l.id).single()
  console.log('before publish:', JSON.stringify(before))

  // Run the real publish path from lib/publish.ts logic (replicated: quality gate passes at draft? use force=false first)
  const { publishListing } = await import('../lib/publish.ts')
  const res = await publishListing(l.id, 'cc325fdd-480b-413d-98e7-2bfc82111c43', { force: false })
  console.log('publish result:', JSON.stringify(res).slice(0, 400))

  const { data: after } = await svc.from('listings').select('id, status, review_stage, listing_ref, published_at, approved_at').eq('id', l.id).single()
  console.log('after publish:', JSON.stringify(after))

  const { data: pub } = await svc.from('public_listings').select('listing_id, slug, published, seller_approved_at').eq('listing_id', l.id).maybeSingle()
  console.log('public row:', JSON.stringify(pub))
}
