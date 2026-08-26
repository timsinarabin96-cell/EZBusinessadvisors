/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// LOI renderer — pure, dependency-free (safe for client components)
// -----------------------------------------------------------------------------
// Renders the structured LOI content as printable HTML. No Supabase, no email,
// no Node-only modules — importing this from a 'use client' page is safe.
// =============================================================================

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

const esc = (s: string | null | undefined) =>
  (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

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
