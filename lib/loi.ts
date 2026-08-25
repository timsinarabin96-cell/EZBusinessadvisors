// =============================================================================
// LOI Generator — Letter of Intent builder for accepted offers
// -----------------------------------------------------------------------------
// One click from an accepted Offer Lab offer → a professional, printable LOI
// document. Content is stored as JSON so it can be re-rendered as HTML/PDF.
// Server-only.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface LoiContent {
  offer_id: string
  listing_id: string
  buyer_lead_id: string | null
  buyer_name: string
  buyer_company: string | null
  seller_name: string
  business_name: string
  industry: string | null
  location: string | null
  purchase_price: number | null
  cash_at_closing: number | null
  seller_note: number | null
  earnout_amount: number | null
  financing_contingency: boolean
  diligence_days: number | null
  training_days: number | null
  exclusivity_days: number
  expiry_date: string
  prepared_by: string | null
  created_at: string
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'

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

/** Render the LOI as a printable HTML document (letterhead style). */
export function renderLoiHtml(content: LoiContent): string {
  const financing = content.financing_contingency
    ? 'financing contingency (buyer financing approval)'
    : 'no financing contingency — cash transaction'
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Letter of Intent — ${esc(content.business_name)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; max-width: 760px; margin: 40px auto; padding: 0 24px; line-height: 1.55; }
  h1 { font-size: 22px; border-bottom: 2px solid #102a43; padding-bottom: 10px; }
  h2 { font-size: 15px; margin-top: 26px; color: #102a43; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 7px 4px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  td:first-child { width: 38%; color: #64748b; }
  p { font-size: 14px; }
  .sig { margin-top: 48px; font-size: 14px; }
  .muted { color: #64748b; font-size: 12px; }
</style></head><body>
  <h1>Letter of Intent</h1>
  <p class="muted">Prepared ${fmtDate(content.created_at)} · Confidential</p>
  <p><strong>${esc(content.buyer_name)}</strong>${content.buyer_company ? ` (${esc(content.buyer_company)})` : ''}
     (“Buyer”) intends to acquire <strong>${esc(content.business_name)}</strong>${content.location ? ` in ${esc(content.location)}` : ''}
     from the Seller on the following indicative terms:</p>
  <h2>Proposed Terms</h2>
  <table>
    <tr><td>Business</td><td>${esc(content.business_name)}${content.industry ? ` — ${esc(content.industry)}` : ''}</td></tr>
    <tr><td>Purchase price</td><td>${money(content.purchase_price)}</td></tr>
    <tr><td>Cash at closing</td><td>${money(content.cash_at_closing)}</td></tr>
    <tr><td>Seller note</td><td>${money(content.seller_note)}</td></tr>
    <tr><td>Earnout</td><td>${money(content.earnout_amount)}</td></tr>
    <tr><td>Structure</td><td>${financing}</td></tr>
    <tr><td>Due diligence period</td><td>${content.diligence_days ?? 45} days</td></tr>
    <tr><td>Seller training/transition</td><td>${content.training_days ?? 30} days</td></tr>
    <tr><td>Exclusivity</td><td>${content.exclusivity_days} days</td></tr>
    <tr><td>Offer expiry</td><td>${fmtDate(content.expiry_date)}</td></tr>
  </table>
  <h2>Conditions</h2>
  <p>This Letter of Intent is non-binding except for the exclusivity and confidentiality provisions. The transaction is subject to satisfactory due diligence, definitive agreement, and closing conditions. Buyer will provide a formal Asset Purchase Agreement following acceptance.</p>
  <div class="sig">
    <p><strong>${esc(content.buyer_name)}</strong> — Buyer<br/>
    <span class="muted">Signed: ____________________ &nbsp; Date: ______________</span></p>
    <p style="margin-top:24px;"><strong>Seller</strong><br/>
    <span class="muted">Signed: ____________________ &nbsp; Date: ______________</span></p>
  </div>
</body></html>`
}

const esc = (s: string | null | undefined) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

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
