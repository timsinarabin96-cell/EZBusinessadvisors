/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// paidListingPipeline — the $250 AI-Verified Listing auto-runner.
// -----------------------------------------------------------------------------
// Runs AFTER Stripe confirms payment (webhook kind='seller_listing'). Payment
// is the authorization — no broker session required, zero manual intervention.
// Mirrors the broker-side One-Click Auto-Build, plus the advisor interview
// kickoff so a public seller gets the SAME AI path as a broker in the CRM:
//   1. runAutoGeneration (recast → BOV → CIM → BLI) from whatever is known
//   2. mark workflow steps complete
//   3. notify the seller with a link to their private portal (portal_token)
//      where they can finish the advisor interview + upload docs; the pipeline
//      re-runs incrementally as more data lands (best-effort, idempotent).
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface PaidPipelineInput {
  listingId: string
  planId?: string
  sellerEmail?: string
  agencyId?: string
}

/** Run the full AI pipeline for a paid listing. Never throws — best-effort. */
export async function runPaidListingPipeline(input: PaidPipelineInput): Promise<{ ok: boolean; note?: string }> {
  const { listingId } = input
  if (!svc) return { ok: false, note: 'storage not configured' }

  try {
    // 1) Core auto-generation: recast → BOV → CIM → BLI (reuses the exact
    //    broker pipeline — single source of truth).
    let generated = 0
    try {
      const { runAutoGeneration } = await import('@/lib/autoGenerate')
      const result = await runAutoGeneration({ listingId })
      generated = (result.artifacts || []).length
      if (!result.ok) console.warn('[paidPipeline] autoGenerate:', result.error)
    } catch (e: any) {
      console.warn('[paidPipeline] autoGenerate threw:', e?.message || e)
    }

    // 2) Workflow checklist: mark financial + document steps complete.
    try {
      const { data: listing } = await svc.from('listings').select('annual_revenue, sde, ebitda').eq('id', listingId).maybeSingle()
      const fin = listing && (listing.annual_revenue != null || listing.sde != null || listing.ebitda != null)
      const done: number[] = []
      if (fin) done.push(2, 3)
      if (generated > 0) done.push(4, 5, 6)
      const { data: wf } = await svc.from('listing_workflows').select('*').eq('listing_id', listingId).maybeSingle()
      if (wf) {
        const existing = new Set<number>((wf.completed_steps || []).map(Number))
        done.forEach((s) => existing.add(s))
        await svc.from('listing_workflows').update({
          current_step: Math.max(Number(wf.current_step || 1), done.length ? Math.min(10, done.length + 1) : 1),
          completed_steps: [...existing],
          updated_at: new Date().toISOString(),
        }).eq('id', wf.id)
      } else if (done.length) {
        await svc.from('listing_workflows').insert({ listing_id: listingId, current_step: done.length + 1, completed_steps: done })
      }
    } catch { /* best-effort */ }

    // 3) Notify the seller with their private portal link (if we have one).
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://concorddeal.com'
    if (input.sellerEmail) {
      try {
        const { data: l } = await svc.from('listings').select('portal_token, business_name').eq('id', listingId).maybeSingle()
        const token = l?.portal_token
        const portalUrl = token ? `${site}/seller/${token}` : `${site}/marketplace/sell?listing=success`
        sendEmail({
          to: input.sellerEmail,
          subject: 'Your AI-Verified Listing is being built 🚀',
          html:
            `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
            `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
            `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
            `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">AI-Verified Listing</div></div>` +
            `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
            `<div style="font-size:15px;font-weight:800;color:#1a1a2e">Payment confirmed — your AI pipeline is running.</div>` +
            `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
            `We're reading your financials, building the Recast, Broker Opinion of Value, Confidential Information Memorandum (CIM) and Buyer Listing Info. ` +
            `This takes a few minutes.${generated ? ` ${generated} document${generated === 1 ? '' : 's'} already generated.` : ''}</div>` +
            (token
              ? `<div style="margin-top:14px;font-size:13px;color:#1e3a5f;background:#f4f8fc;border:1px solid #dbe7f3;border-radius:8px;padding:12px 14px">` +
                `🔐 Your private seller portal (track progress, finish the interview, upload docs): ` +
                `<a href="${portalUrl}" style="color:#2563eb;font-weight:700;word-break:break-all">${portalUrl}</a></div>`
              : '') +
            `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
          kind: 'generic',
          meta: { paid_listing_pipeline: true, listing_id: listingId, plan: input.planId || 'professional' },
        }).catch(() => {})
      } catch { /* best-effort */ }
    }

    return { ok: true, note: generated ? `${generated} documents generated` : 'pipeline started' }
  } catch (e: any) {
    return { ok: false, note: e?.message || 'pipeline failed' }
  }
}
