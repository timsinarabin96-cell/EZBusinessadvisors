import { createClient } from '@supabase/supabase-js'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, KEY, { auth: { persistSession: false } })
const { publishListing } = await import('../lib/publish.ts')
const res = await publishListing('3104c1b5-454b-4f5c-a111-8b8423e76f48', 'cc325fdd-480b-413d-98e7-2bfc82111c43', { force: false })
console.log('publish:', JSON.stringify(res).slice(0, 260))
const { data: after } = await svc.from('listings').select('id, status, review_stage, published_at').eq('id', '3104c1b5-454b-4f5c-a111-8b8423e76f48').single()
console.log('after:', JSON.stringify(after))
const { data: pub } = await svc.from('public_listings').select('listing_id, slug, published').eq('listing_id', '3104c1b5-454b-4f5c-a111-8b8423e76f48').maybeSingle()
console.log('public:', JSON.stringify(pub))
