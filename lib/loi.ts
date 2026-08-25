// =============================================================================
// LOI Generator — Letter of Intent builder for accepted offers
// -----------------------------------------------------------------------------
// One click from an accepted Offer Lab offer → a professional, printable LOI
// document. Content is stored as JSON so it can be re-rendered as HTML/PDF.
// Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { renderLoiHtml, type LoiContent } from './loiRender'

export { renderLoiHtml, type LoiContent } from './loiRender'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

/** Build the structured LOI content from an offer + listing + buyer lead. */
export async function buildLoiContent(offerId: string): Promise<{ ok: boolean; error?: string; content?: LoiContent; listingId?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }

  const { data: offer } = await svc
    .from('deal_offers')
    .select('*, listings(business_name, industry, location_general, agency_id), buyer_leads(full_name, company)')
    .eq('id', offerId)
    .maybeSingle()
  if (!offer) return { ok: false, error: 'Offer not found' }

  const listing = offer.listings as any
  const buyer = offer.buyer_leads as any

  const content: LoiContent = {
    offer_id: offer.id,
    listing_id: offer.listing_id,
    buyer_lead_id: offer.buyer_lead_id || null,
    buyer_name: buyer?.full_name || 'Buyer',
    buyer_company: buyer?.company || null,
    seller_name: 'Seller',
    business_name: listing?.business_name || 'the Business',
    industry: listing?.industry || null,
    location: listing?.location_general || null,
    purchase_price: offer.purchase_price ?? null,
    cash_at_closing: offer.cash_at_closing ?? null,
    seller_note: offer.seller_note ?? null,
    earnout_amount: offer.earnout_amount ?? null,
    financing_contingency: !!offer.financing_contingency,
    diligence_days: offer.diligence_days ?? null,
    training_days: offer.training_days ?? null,
    exclusivity_days: 45,
    expiry_date: new Date(Date.now() + 10 * 86400000).toISOString(),
    prepared_by: null,
    created_at: new Date().toISOString(),
  }

  return { ok: true, content, listingId: offer.listing_id }
}

/** Persist a generated LOI for an agency (idempotent per offer). */
export async function saveLoi(content: LoiContent, agencyId: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data, error } = await svc
    .from('letters_of_intent')
    .upsert(
      {
        agency_id: agencyId,
        offer_id: content.offer_id,
        listing_id: content.listing_id,
        buyer_lead_id: content.buyer_lead_id,
        status: 'draft',
        content: content as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'offer_id' },
    )
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

/** List LOIs for an agency. */
export async function listLois(agencyId: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  const { data } = await svc
    .from('letters_of_intent')
    .select('*, listings(business_name), deal_offers(purchase_price)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data || []) as Record<string, unknown>[]
}

/** Notify the agency's brokers that an LOI was generated. */
export async function notifyLoiGenerated(agencyId: string, businessName: string): Promise<void> {
  if (!svc) return
  const { data: members } = await svc.from('agency_members').select('profile_id, role, is_owner').eq('agency_id', agencyId)
  const ids = (members || []).filter((m) => m.is_owner || m.role === 'admin').map((m) => m.profile_id)
  if (!ids.length) return
  const { data: profiles } = await svc.from('profiles').select('id, email').in('id', ids)
  for (const p of profiles || []) {
    if (p.email) {
      // Lazy import keeps nodemailer (Node-only) out of the client bundle.
      const { notify } = await import('./email').catch(() => ({ notify: null as null | typeof import('./email').notify }))
      if (notify) await notify('loi_generated', p.email, { businessName })
    }
  }
}

/** Update an LOI's status (draft → sent → signed → accepted/withdrawn). */
export async function updateLoiStatus(
  loiId: string,
  status: 'draft' | 'sent' | 'signed' | 'accepted' | 'withdrawn',
): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: loi } = await svc.from('letters_of_intent').select('agency_id').eq('id', loiId).maybeSingle()
  if (!loi) return { ok: false, error: 'LOI not found' }
  const { error } = await svc
    .from('letters_of_intent')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', loiId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
