/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// sellerNurture — automated follow-up engine for PAID public seller listings.
// -----------------------------------------------------------------------------
// A seller pays $250 → the system never stops until the intake is genuinely
// complete (interview done + financial docs uploaded + CIM/BOV/Recast built)
// or the seller is FLAGGED to the agency admin as stalled (7 days, no progress).
//
// Cadence (hours since paid_at):
//   0     pipeline sends the payment confirmation + portal link (paidListingPipeline)
//   24    interview not started        → "start your advisor interview"
//   24    interview partially done     → "pick up where you left off" + progress
//   48    no financial docs uploaded   → "why documents power your CIM"
//   72    still incomplete             → escalation 1
//   120   still incomplete             → escalation 2 (nudge_count gate)
//   168   still incomplete             → FLAG to agency admin + boss (stalled)
//   done  interview completed + docs + CIM artifacts → completed, no more mail
//
// Reuses the stale-draft nudge pattern (scan → dedupe via last_nudge_at →
// escalate), applied to the public seller portal. Never throws — a failing
// listing is skipped and retried next run.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export interface SellerIntakeState {
  interviewStarted: boolean
  interviewCompleted: boolean
  interviewAnswered: number
  interviewTotal: number
  docsUploaded: number
  cimBuilt: boolean
  recastBuilt: boolean
  bovBuilt: boolean
}

export interface NurtureDecision {
  action: 'none' | 'email' | 'flag'
  subject?: string
  html?: string
  /** When flagged — the human to notify (agency owner/admin or platform). */
  flagTo?: string[]
}

// ---------------------------------------------------------------------------
// Live intake state — reads the same tables the seller portal writes.
// ---------------------------------------------------------------------------
export async function getSellerIntakeState(listingId: string): Promise<SellerIntakeState> {
  const empty: SellerIntakeState = {
    interviewStarted: false, interviewCompleted: false, interviewAnswered: 0, interviewTotal: 0,
    docsUploaded: 0, cimBuilt: false, recastBuilt: false, bovBuilt: false,
  }
  if (!svc) return empty

  const state: SellerIntakeState = { ...empty }

  // Interview (financial_interviews: qa array + status).
  try {
    const { data: interview } = await svc
      .from('financial_interviews')
      .select('status, qa, completed_at')
      .eq('listing_id', listingId)
      .maybeSingle()
    if (interview) {
      state.interviewStarted = true
      state.interviewCompleted = interview.status === 'completed' || !!interview.completed_at
      const qa = Array.isArray((interview as any).qa) ? (interview as any).qa : []
      state.interviewAnswered = qa.length
    }
  } catch { /* best-effort */ }

  // Financial docs uploaded by the SELLER (portal uploads are source='seller',
  // broker uploads also count — any real doc helps the CIM).
  try {
    const { count } = await svc
      .from('financial_documents')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId)
    state.docsUploaded = count || 0
  } catch { /* best-effort */ }

  // Artifacts: recast/BOV/CIM versions + workflow completion.
  try {
    const [cim, bov, bli] = await Promise.all([
      svc.from('cim_versions').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
      svc.from('bov_versions').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
      svc.from('bli_versions').select('id', { count: 'exact', head: true }).eq('listing_id', listingId),
    ])
    state.recastBuilt = false // recast is tracked via workflow step 3 below
    state.bovBuilt = (bov.count || 0) > 0
    state.cimBuilt = (cim.count || 0) > 0
  } catch {
    // Fallback: workflow completed_steps (steps 4/5/6 = BOV/CIM/BLI).
    try {
      const { data: wf } = await svc
        .from('listing_workflows')
        .select('completed_steps')
        .eq('listing_id', listingId)
        .maybeSingle()
      const done: number[] = Array.isArray((wf as any)?.completed_steps) ? (wf as any).completed_steps : []
      state.recastBuilt = done.includes(3)
      state.bovBuilt = done.includes(4)
      state.cimBuilt = done.includes(5)
    } catch { /* best-effort */ }
  }

  return state
}

// ---------------------------------------------------------------------------
// Decision — what to send (or do) for one listing at this moment.
// ---------------------------------------------------------------------------
export function decideNurture(
  hoursSincePaid: number,
  state: SellerIntakeState,
  nudgeCount: number,
): NurtureDecision {
  const portalLine = `<div style="font-size:12px;color:#94a3b8;margin-top:8px">Your private portal: the confirmation email has your link (or use the link from your payment receipt).</div>`

  // DONE — genuinely complete: interview + docs + artifacts.
  if (state.interviewCompleted && state.docsUploaded > 0 && (state.cimBuilt || state.recastBuilt)) {
    return { action: 'none' } // completed — handled by markComplete in the runner
  }

  // FLAG — stalled 7+ days with real progress missing.
  if (hoursSincePaid >= 7 * 24) {
    const missing: string[] = []
    if (!state.interviewStarted) missing.push('the advisor interview was never started')
    else if (!state.interviewCompleted) missing.push(`the advisor interview is incomplete (${state.interviewAnswered} answered)`)
    if (state.docsUploaded === 0) missing.push('no financial documents were uploaded')
    if (!state.cimBuilt && !state.recastBuilt) missing.push('the CIM/Recast was not generated')
    return {
      action: 'flag',
      flagTo: [], // resolved by the runner (agency owners/admins + boss)
      subject: `⚠️ Stalled paid seller — ${missing.join('; ')}`,
    }
  }

  // 24h — interview not started.
  if (hoursSincePaid >= 24 && !state.interviewStarted) {
    return {
      action: 'email',
      subject: 'Your AI advisor interview is ready — 2 minutes to start',
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Your AI-Verified Listing</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:15px;font-weight:800;color:#1a1a2e">We're building your listing — and we need a few answers from you.</div>` +
        `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
        `The AI advisor interview takes about 2 minutes and sharpens your valuation and CIM significantly. ` +
        `Start it in your private seller portal — the link from your payment confirmation email.</div>` +
        `<div style="margin-top:14px;background:#f4f8fc;border:1px solid #dbe7f3;border-radius:8px;padding:12px 14px;font-size:13px;color:#1e3a5f">` +
        `💡 Every answer makes your Broker Opinion of Value and CIM more defensible — buyers' advisors read this closely.</div>` +
        portalLine + `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
    }
  }

  // 24h+ — interview partially done: pick up where you left off.
  if (hoursSincePaid >= 24 && state.interviewStarted && !state.interviewCompleted && state.interviewAnswered > 0) {
    return {
      action: 'email',
      subject: `Pick up where you left off — ${state.interviewAnswered} answer${state.interviewAnswered === 1 ? '' : 's'} saved`,
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Continue your interview</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:15px;font-weight:800;color:#1a1a2e">You're ${state.interviewAnswered} answer${state.interviewAnswered === 1 ? '' : 's'} in — keep going.</div>` +
        `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
        `Your progress is saved. Return to your private seller portal and continue the advisor interview — it directly improves your valuation range and CIM.</div>` +
        portalLine + `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
    }
  }

  // 48h — no financial docs uploaded.
  if (hoursSincePaid >= 48 && state.docsUploaded === 0) {
    return {
      action: 'email',
      subject: 'Upload your financials — they power your CIM',
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Your AI-Verified Listing</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:15px;font-weight:800;color:#1a1a2e">Why your documents matter (a lot).</div>` +
        `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
        `Your CIM and Recast are built from your actual financials. Upload P&L statements, tax returns, or bank statements in your private portal ` +
        `and the AI reads them into a broker-grade recast — buyers and lenders trust verified numbers far more than estimates.</div>` +
        `<div style="margin-top:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;font-size:13px;color:#166534">` +
        `📊 Sellers with documents uploaded get meaningfully stronger valuations and shorter time-to-offer.</div>` +
        portalLine + `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
    }
  }

  // 72h — escalation 1.
  if (hoursSincePaid >= 72 && nudgeCount >= 2) {
    return {
      action: 'email',
      subject: 'Your listing is ready to finish — 5 minutes',
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Final step</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:15px;font-weight:800;color:#1a1a2e">Finish the interview + upload docs to unlock your full CIM.</div>` +
        `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
        `You've paid for the AI-Verified Listing package — the CIM/BOV/Recast only needs your input to be complete. ` +
        `Everything is saved; return to your portal whenever you're ready.</div>` +
        portalLine + `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
    }
  }

  // 120h — escalation 2 (only after several nudges).
  if (hoursSincePaid >= 120 && nudgeCount >= 3) {
    return {
      action: 'email',
      subject: 'Your CIM is waiting on you — let\u2019s finish it',
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Almost there</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:15px;font-weight:800;color:#1a1a2e">We want your listing to stand out — complete it and we\u2019ll do the rest.</div>` +
        `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
        `The advisor interview and your financial documents are the last two pieces. Once they're in, the platform generates your complete ` +
        `Confidential Information Memorandum, Broker Opinion of Value, and recast automatically.</div>` +
        portalLine + `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform</p></div>`,
    }
  }

  return { action: 'none' }
}

// ---------------------------------------------------------------------------
// Runner — one pass over all active paid seller listings.
// ---------------------------------------------------------------------------
export async function runSellerNurture(): Promise<{ processed: number; emailed: number; flagged: number; completed: number }> {
  if (!svc) return { processed: 0, emailed: 0, flagged: 0, completed: 0 }
  let processed = 0, emailed = 0, flagged = 0, completed = 0

  // All active nurture rows (paid sellers), oldest-paid first.
  const { data: rows } = await svc
    .from('seller_nurture')
    .select('*')
    .eq('status', 'active')
    .order('paid_at', { ascending: true })
    .limit(500)

  for (const row of (rows || []) as any[]) {
    processed++
    const listingId = row.listing_id as string
    const hoursSincePaid = Math.max(0, (Date.now() - new Date(row.paid_at).getTime()) / HOUR)
    const nudgeCount = Number(row.nudge_count || 0)

    const state = await getSellerIntakeState(listingId)

    // Complete → retire.
    if (state.interviewCompleted && state.docsUploaded > 0 && (state.cimBuilt || state.recastBuilt)) {
      await svc.from('seller_nurture').update({ status: 'completed' }).eq('id', row.id)
      completed++
      continue
    }

    const decision = decideNurture(hoursSincePaid, state, nudgeCount)

    if (decision.action === 'email' && decision.subject && decision.html) {
      await sendEmail({
        to: row.seller_email,
        subject: decision.subject,
        html: decision.html,
        kind: 'generic',
        meta: { seller_nurture: true, listing_id: listingId, agency_id: row.agency_id, nudge: nudgeCount + 1 },
      }).catch(() => {})
      await svc.from('seller_nurture').update({ last_nudge_at: new Date().toISOString(), nudge_count: nudgeCount + 1 }).eq('id', row.id)
      emailed++
      continue
    }

    if (decision.action === 'flag') {
      // Notify the agency's owners/admins + the platform boss.
      const flagTo: string[] = []
      try {
        const { data: members } = await svc
          .from('agency_members')
          .select('profile_id, is_owner, role')
          .eq('agency_id', row.agency_id)
        const ids = (members || []).filter((m: any) => m.is_owner || m.role === 'admin').map((m: any) => m.profile_id)
        if (ids.length) {
          const { data: profiles } = await svc.from('profiles').select('email').in('id', ids)
          ;(profiles || []).forEach((p: any) => p?.email && flagTo.push(p.email))
        }
      } catch { /* best-effort */ }
      const boss = process.env.STORE_OWNER_EMAIL || 'rtimsina@ezbusinessadvisors.com'
      flagTo.push(boss)
      const missing = decision.subject || 'Paid seller stalled'

      for (const to of new Set(flagTo.filter(Boolean))) {
        await sendEmail({
          to,
          subject: `⚠️ ${missing} — needs a human touch`,
          html:
            `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
            `<div style="background:#7f1d1d;border-radius:10px;padding:20px 24px;color:#fff">` +
            `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
            `<div style="font-size:12px;color:#fca5a5;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Stalled paid seller — action needed</div></div>` +
            `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
            `<div style="font-size:15px;font-weight:800;color:#1a1a2e">${missing}</div>` +
            `<div style="font-size:13.5px;color:#555;line-height:1.6;margin-top:8px">` +
            `A seller paid for the AI-Verified Listing package but their intake is incomplete after 7 days. ` +
            `Reach out personally: check the listing in the CRM (portal token attached) and help them finish the interview + docs.</div>` +
            `<div style="margin-top:14px;background:#f4f8fc;border:1px solid #dbe7f3;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#1e3a5f">` +
            `Listing: <b>${listingId}</b> · Seller: <b>${row.seller_email}</b> · Paid: <b>${new Date(row.paid_at).toLocaleDateString('en-US')}</b></div>` +
            `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform · automated stall flag</p></div>`,
          kind: 'generic',
          meta: { seller_stalled: true, listing_id: listingId, agency_id: row.agency_id, seller_email: row.seller_email },
        }).catch(() => {})
      }
      await svc.from('seller_nurture').update({ status: 'flagged', flagged_at: new Date().toISOString() }).eq('id', row.id)
      flagged++
    }
  }

  return { processed, emailed, flagged, completed }
}

/** Enroll a paid seller listing into the nurture sequence (called on payment). */
export async function enrollPaidSeller(input: {
  listingId: string
  agencyId: string
  sellerEmail: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'not configured' }
  const email = (input.sellerEmail || '').trim().toLowerCase()
  if (!input.listingId || !input.agencyId || !email) return { ok: false, error: 'listingId, agencyId and sellerEmail are required' }
  const { error } = await svc.from('seller_nurture').upsert(
    { listing_id: input.listingId, agency_id: input.agencyId, seller_email: email, paid_at: new Date().toISOString(), status: 'active' },
    { onConflict: 'listing_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
