// =============================================================================
// AI Negotiation Assistant
// -----------------------------------------------------------------------------
// Drafts counter-offer strategies from an Offer Lab offer. Uses scoreOffer
// style heuristics to propose three concrete variants (price bump, cash/seller-
// note mix, diligence flexibility), each with a rationale. Content is stored as
// jsonb and also rendered as a printable letter-style HTML document.
// Server-only. Never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { scoreOffer } from './offers'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface CounterVariant {
  label: string
  price: number
  cash_at_closing: number
  seller_note: number
  diligence_days: number | null
  seller_value_score: number
  rationale: string
}

export interface NegotiationContent {
  variants: CounterVariant[]
  instructions: string
  offer: {
    offer_id: string
    business_name: string
    asking_price: number | null
    purchase_price: number | null
    cash_at_closing: number | null
    seller_note: number | null
    diligence_days: number | null
    training_days: number | null
    buyer_name: string | null
    buyer_company: string | null
    original_score: number
  }
}

const round = (n: number) => Math.max(0, Math.round(n))

/** Compute a score for a hypothetical variant (mirrors lib/offers scoreOffer). */
function variantScore(v: { price: number; cash_at_closing: number; seller_note: number; diligence_days: number | null }): number {
  return scoreOffer({
    purchase_price: v.price,
    cash_at_closing: v.cash_at_closing,
    seller_note: v.seller_note,
    earnout_amount: 0,
    financing_contingency: false,
    diligence_days: v.diligence_days,
    training_days: null,
  })
}

/**
 * Build three counter-offer variants from an offer + listing.
 * Pure function (deterministic) so it is unit-testable.
 */
export function buildCounterVariants(input: {
  purchase_price?: number | null
  cash_at_closing?: number | null
  seller_note?: number | null
  diligence_days?: number | null
  asking_price?: number | null
}): CounterVariant[] {
  const base = input.purchase_price ?? input.asking_price ?? 0
  const baseCash = input.cash_at_closing ?? (base > 0 ? Math.round(base * 0.6) : 0)
  const baseNote = input.seller_note ?? (base > 0 ? Math.round(base * 0.3) : 0)
  const diligence = input.diligence_days ?? 45

  // Variant 1 — moderate bump, cash-lean: price +3%, keep the cash/seller-note
  // mix roughly as offered but trim the note slightly to signal strength.
  const v1Price = round(base * 1.03)
  const v1Cash = round(baseCash * 1.05)
  const v1Note = Math.max(0, round(baseNote * 0.85))
  // Variant 2 — cash-heavy close: modest price increase, heavy cash, tiny note.
  const v2Price = round(base * 1.02)
  const v2Cash = round(v2Price * 0.9)
  const v2Note = round(v2Price * 0.05)
  // Variant 3 — full value with flexibility: +5% price, more seller note,
  // extended diligence to de-risk the buyer's financing/verification.
  const v3Price = round(base * 1.05)
  const v3Cash = round(v3Price * 0.55)
  const v3Note = round(v3Price * 0.3)
  const v3Diligence = diligence + 15

  const variants: CounterVariant[] = [
    {
      label: 'Moderate bump',
      price: v1Price,
      cash_at_closing: v1Cash,
      seller_note: v1Note,
      diligence_days: diligence,
      seller_value_score: variantScore({ price: v1Price, cash_at_closing: v1Cash, seller_note: v1Note, diligence_days: diligence }),
      rationale:
        'Raise the price ~3% while trimming the seller note — a small ask that keeps the deal moving and signals the buyer is serious, not anchored to the original number.',
    },
    {
      label: 'Cash-heavy close',
      price: v2Price,
      cash_at_closing: v2Cash,
      seller_note: v2Note,
      diligence_days: diligence,
      seller_value_score: variantScore({ price: v2Price, cash_at_closing: v2Cash, seller_note: v2Note, diligence_days: diligence }),
      rationale:
        'Nearly all-cash at a modest premium. Sellers discount risk: cash at closing is worth more than paper, so this often lands better than a higher note-heavy price.',
    },
    {
      label: 'Full value, extended diligence',
      price: v3Price,
      cash_at_closing: v3Cash,
      seller_note: v3Note,
      diligence_days: v3Diligence,
      seller_value_score: variantScore({ price: v3Price, cash_at_closing: v3Cash, seller_note: v3Note, diligence_days: v3Diligence }),
      rationale:
        'Pursue the full ~5% premium by offering a seller note and +15 diligence days. Use this when the buyer needs financing certainty or the seller is emotionally attached to the asking number.',
    },
  ]
  return variants
}

/** Render the negotiation draft as a printable letter-style HTML document. */
export function renderNegotiationHtml(content: NegotiationContent): string {
  const o = content.offer
  const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
  const rows = content.variants
    .map(
      (v, i) => `<tr>
      <td><strong>Option ${i + 1} — ${esc(v.label)}</strong><br/><span class="muted">${esc(v.rationale)}</span></td>
      <td>${money(v.price)}</td>
      <td>${money(v.cash_at_closing)}</td>
      <td>${money(v.seller_note)}</td>
      <td>${v.diligence_days ?? 45} days</td>
      <td>${v.seller_value_score}/100</td>
    </tr>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Counter-Offer Strategy — ${esc(o.business_name)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; max-width: 820px; margin: 40px auto; padding: 0 24px; line-height: 1.55; }
  h1 { font-size: 22px; border-bottom: 2px solid #102a43; padding-bottom: 10px; }
  h2 { font-size: 15px; margin-top: 26px; color: #102a43; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th, td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  th { color: #64748b; font-weight: 600; }
  .muted { color: #64748b; font-size: 12px; }
  .note { font-size: 13px; margin-top: 18px; padding: 12px 14px; background: #f8fafc; border-left: 3px solid #c9a84c; }
</style></head><body>
  <h1>Negotiation Strategy — ${esc(o.business_name)}</h1>
  <p class="muted">Prepared ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Confidential</p>
  <p>Current offer from <strong>${esc(o.buyer_name)}</strong>${o.buyer_company ? ` (${esc(o.buyer_company)})` : ''}:
     <strong>${money(o.purchase_price)}</strong> against an asking price of ${money(o.asking_price)}.
     Original seller-value score: <strong>${o.original_score}/100</strong>.</p>
  <h2>Recommended Counter-Offer Options</h2>
  <table>
    <tr><th>Option</th><th>Price</th><th>Cash at closing</th><th>Seller note</th><th>Diligence</th><th>Seller score</th></tr>
    ${rows}
  </table>
  <div class="note"><strong>Coach's instructions:</strong> ${esc(content.instructions)}</div>
</body></html>`
}

const esc = (s: string | null | undefined) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/**
 * Draft (or regenerate) a counter-offer strategy for an offer.
 * Upserts per offer (unique offer_id index); falls back to a plain insert if
 * the constraint is missing. Never throws.
 */
export async function draftCounterOffer(
  offerId: string,
  instructions?: string,
): Promise<{ ok: boolean; error?: string; draft?: Record<string, unknown> }> {
  try {
    if (!svc) return { ok: false, error: 'Database is not configured' }
    if (!offerId) return { ok: false, error: 'offerId is required' }

    const { data: offer } = await svc
      .from('deal_offers')
      .select('*, listings(business_name, asking_price, agency_id), buyer_leads(full_name, company)')
      .eq('id', offerId)
      .maybeSingle()
    if (!offer) return { ok: false, error: 'Offer not found' }
    const offerAny = offer as Record<string, unknown> & {
      listing_id: string
      listings?: { business_name?: string | null; asking_price?: number | null; agency_id?: string } | null
      buyer_leads?: { full_name?: string | null; company?: string | null } | null
    }
    const listing = offerAny.listings
    const buyer = offerAny.buyer_leads
    const agencyId = listing?.agency_id
    if (!agencyId) return { ok: false, error: 'Offer is not linked to an agency' }

    const content: NegotiationContent = {
      variants: buildCounterVariants({
        purchase_price: (offerAny.purchase_price as number | null) ?? null,
        cash_at_closing: (offerAny.cash_at_closing as number | null) ?? null,
        seller_note: (offerAny.seller_note as number | null) ?? null,
        diligence_days: (offerAny.diligence_days as number | null) ?? null,
        asking_price: listing?.asking_price ?? null,
      }),
      instructions:
        instructions?.trim() ||
        'Lead with the cash-heavy option unless the seller is anchored to price; use the full-value option only when diligence needs more time. Keep every counter within 5% of the original offer.',
      offer: {
        offer_id: offerId,
        business_name: listing?.business_name || 'the Business',
        asking_price: listing?.asking_price ?? null,
        purchase_price: (offerAny.purchase_price as number | null) ?? null,
        cash_at_closing: (offerAny.cash_at_closing as number | null) ?? null,
        seller_note: (offerAny.seller_note as number | null) ?? null,
        diligence_days: (offerAny.diligence_days as number | null) ?? null,
        training_days: (offerAny.training_days as number | null) ?? null,
        buyer_name: buyer?.full_name || 'the Buyer',
        buyer_company: buyer?.company || null,
        original_score: typeof offerAny.seller_value_score === 'number' ? offerAny.seller_value_score : 0,
      },
    }
    const html = renderNegotiationHtml(content)

    const payload = {
      agency_id: agencyId,
      offer_id: offerId,
      listing_id: offerAny.listing_id,
      draft_type: 'counter',
      content: content as unknown as Record<string, unknown>,
      html,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await svc.from('negotiation_drafts').upsert(payload, { onConflict: 'offer_id' }).select('*').single()
    if (error) {
      // Constraint missing? Insert a fresh row instead.
      const { data: inserted, error: insertError } = await svc.from('negotiation_drafts').insert(payload).select('*').single()
      if (insertError) return { ok: false, error: insertError.message || 'Failed to save negotiation draft' }
      return { ok: true, draft: inserted as Record<string, unknown> }
    }
    return { ok: true, draft: data as Record<string, unknown> }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Negotiation draft failed' }
  }
}

/** List negotiation drafts for an agency. */
export async function listNegotiationDrafts(agencyId: string): Promise<Record<string, unknown>[]> {
  if (!svc) return []
  const { data, error } = await svc
    .from('negotiation_drafts')
    .select('*, listings(business_name), deal_offers(purchase_price, status)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return []
  return (data || []) as Record<string, unknown>[]
}
