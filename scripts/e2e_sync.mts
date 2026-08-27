import { createClient } from '@supabase/supabase-js'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, KEY, { auth: { persistSession: false } })
const ids = ['f7db5deb-79a6-4125-bacc-b9fca432b613','3104c1b5-454b-4f5c-a111-8b8423e76f48','cba005b3-68d1-4d85-8443-ae8f9bb17338']
for (const id of ids) {
  const { data: listing } = await svc.from('listings').select('*').eq('id', id).single()
  const slugBase = String(listing.business_name || listing.headline || 'business').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'').slice(0,60)
  const slug = `${slugBase || 'business'}-${String(id).slice(0,8)}`
  const row = {
    listing_id: id, slug,
    public_title: listing.ai_metadata?.public_title || listing.headline || listing.business_name || null,
    public_summary: listing.ai_metadata?.public_summary || (listing.description ? String(listing.description).slice(0,600) : null),
    public_highlights: Array.isArray(listing.ai_metadata?.public_highlights) ? listing.ai_metadata.public_highlights : [],
    published: true, is_confidential: true,
    show_financials: Boolean(listing.ai_metadata?.show_financials),
    location_exposure: 'general',
  }
  await svc.from('public_listings').update(row).eq('listing_id', id)
  console.log(listing.business_name, '→', row.public_title)
}
