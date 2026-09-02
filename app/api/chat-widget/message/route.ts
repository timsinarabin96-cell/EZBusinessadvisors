/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { chatSensitive, isSensitiveAiConfigured } from '@/lib/ai/sensitiveProvider'
import { extractLeadFromTranscript, EMAIL_RE, type ChatLeadExtraction } from '@/lib/ai/chatLeadExtraction'
import { resolveAgencyBroker } from '@/lib/publicListingMeta'
import { createNotification } from '@/lib/notifications'
import { notify } from '@/lib/email'
import type { InternalMessage } from '@/lib/claude/client'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

// =============================================================================
// POST /api/chat-widget/message — website chat widget → real sales agent.
// -----------------------------------------------------------------------------
// Public mode: the AI acts as a real sales agent that collects seller/buyer
// details conversationally, one question at a time. When enough fields are
// present the SERVER (not the model alone) extracts a validated payload and
// creates a real seller_leads/buyer_leads row, notifies the responsible
// broker, and tells the visitor who will follow up.
//
// History fix: prior turns for this session are loaded from call_transcripts
// and passed into the AI call so follow-ups ("Yes", "what about…") continue
// the same conversation instead of resetting to a generic greeting.
// =============================================================================

const SELLER_BUYER_SYSTEM = `You are a warm, efficient AI sales agent for a business brokerage (EZ Business Advisors). Your job in this chat is to actually qualify the visitor and collect real information — you are NOT a FAQ bot that just describes the process or tells people to "fill out a form" or "use the valuation tool" instead of talking to you.

Ask ONE question at a time. Keep replies short (2-4 sentences max).

If the visitor wants to SELL a business, collect (in this rough order, skipping anything they've already told you): their name, email, phone, business name, industry, location, approximate annual revenue, reason for selling, timeline to sell, and (optional) asking price. Once you have their name and email, thank them and let them know their info has been captured and a broker will reach out — do not keep grilling them forever.

If the visitor wants to BUY a business, collect: their name, email, phone, budget range, industry/location of interest, and timing. Never disclose confidential business financials (asking price ranges are fine, but not real SDE/EBITDA/financials) — for that, tell them to use the "request details" flow on the specific listing.

Never ask for or handle payment info, SSN, or other sensitive financial account details.

If someone just wants to browse or ask general questions (not sell/buy), help them normally and point them to the marketplace or relevant page — you don't need to collect their contact info for casual browsing.

Never invent platform features that don't exist. Be concise and human, not corporate.`

const CRM_SYSTEM = 'You are the AI assistant inside a business-brokerage CRM (EZ Business Advisors). Help the broker use the platform: listings, deal pipeline, lead management, NDA/listing agreements, documents, AI agents, calendar, communications, training. Answer briefly and concretely; point to the right tool/page when relevant. Never invent features that do not exist.'

interface SessionMeta {
  last_processed_at?: string | null
  mode?: string
  lead_created?: boolean
  lead_email?: string | null
}

/** Build InternalMessage[] history (oldest→newest) from stored transcript rows. */
function toHistory(rows: Array<{ speaker: string; content: string }>): InternalMessage[] {
  return rows
    .filter((r) => r.speaker === 'caller' || r.speaker === 'assistant')
    .map((r) => ({ role: r.speaker === 'caller' ? 'user' : 'assistant', content: r.content }) as InternalMessage)
}

export async function POST(req: NextRequest) {
  // Anti-abuse: public-ish endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 })

  const agencyId = process.env.VOICE_AGENT_AGENCY_ID || ''
  if (!agencyId) return NextResponse.json({ ok: false, error: 'Chat agent is not configured' }, { status: 503 })

  let body: any = {}
  try { body = await req.json() } catch { /* fall through */ }
  const message = String(body?.message || '').trim().slice(0, 1000)
  if (!message) return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 })

  const mode = body?.mode === 'crm' ? 'crm' : 'public'
  let sessionId = String(body?.sessionId || '').trim().slice(0, 64)
  if (!sessionId) sessionId = `web_${crypto.randomUUID()}`

  // Reuse an open thread for this visitor, else start one.
  const { data: existing } = await db
    .from('call_sessions')
    .select('id, metadata')
    .eq('agency_id', agencyId)
    .eq('provider', 'web')
    .eq('purpose', 'chat_widget')
    .eq('caller_number', sessionId)
    .eq('status', 'in_progress')
    .limit(1)
    .maybeSingle()

  let dbSessionId: string
  let sessionMeta: SessionMeta = { mode }
  if (existing?.id) {
    dbSessionId = existing.id
    sessionMeta = { ...(existing.metadata as SessionMeta | null), mode }
  } else {
    const { data: created, error } = await db
      .from('call_sessions')
      .insert({
        agency_id: agencyId,
        provider: 'web',
        purpose: 'chat_widget',
        direction: 'inbound',
        status: 'in_progress',
        caller_number: sessionId,
        metadata: { last_processed_at: null, mode },
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !created?.id) return NextResponse.json({ ok: false, error: 'Failed to open chat session' }, { status: 500 })
    dbSessionId = created.id
  }

  // Load prior turns for real conversational memory (fixes the "Yes" reset
  // bug — previously every reply was generated with NO history at all).
  const { data: priorRows } = await db
    .from('call_transcripts')
    .select('speaker, content, sequence')
    .eq('call_session_id', dbSessionId)
    .order('sequence', { ascending: true })
    .limit(40)
  const history = toHistory(priorRows || [])

  const { error } = await db.from('call_transcripts').insert({
    agency_id: agencyId,
    call_session_id: dbSessionId,
    sequence: Date.now() % 100000,
    speaker: 'caller',
    content: message,
  })
  if (error) return NextResponse.json({ ok: false, error: 'Failed to store message' }, { status: 500 })

  // ── Server-side AI reply (no local watcher needed) ──────────────────────
  let aiError: string | null = null
  let leadHandoffText: string | null = null
  try {
    if (isSensitiveAiConfigured()) {
      const isCrm = mode === 'crm'
      const system = isCrm ? CRM_SYSTEM : SELLER_BUYER_SYSTEM
      try {
        const res = await chatSensitive({ system, userMessage: message, maxTokens: 400, history })
        let reply = (res.text || '').trim().slice(0, 1500)

        // Lead capture — public mode only, and only once per session.
        if (!isCrm && !sessionMeta.lead_created) {
          const fullTranscriptText = [...history, { role: 'user', content: message } as InternalMessage, { role: 'assistant', content: reply } as InternalMessage]
            .map((m) => `${m.role === 'user' ? 'visitor' : 'assistant'}: ${m.content}`)
            .join('\n')

          const extraction = await extractLeadFromTranscript(fullTranscriptText, (input) => chatSensitive(input))
          if (extraction.ready && extraction.email && EMAIL_RE.test(extraction.email)) {
            const created = await createLeadFromExtraction(db, agencyId, extraction)
            if (created.ok && !created.duplicate) {
              sessionMeta = { ...sessionMeta, lead_created: true, lead_email: extraction.email }
              const broker = await resolveAgencyBroker(agencyId)
              const brokerLine = broker
                ? `Your broker ${broker.name} will follow up${broker.phone ? ` — ${broker.phone}` : ''}${broker.email ? ` / ${broker.email}` : ''}.`
                : 'A broker will follow up with you shortly.'
              leadHandoffText = `Got it — I've saved your info (${extraction.name}, ${extraction.email}${extraction.business_name ? `, ${extraction.business_name}` : ''}). ${brokerLine}`
              reply = `${reply}\n\n✅ ${leadHandoffText}`
            } else if (created.ok && created.duplicate) {
              sessionMeta = { ...sessionMeta, lead_created: true, lead_email: extraction.email }
            }
            // On insert failure we deliberately do NOT set lead_created, so a
            // later turn (or the fallback below) can retry.
          }
        }

        if (reply) {
          const { error: insErr } = await db.from('call_transcripts').insert({
            agency_id: agencyId,
            call_session_id: dbSessionId,
            sequence: (Date.now() + 1) % 100000,
            speaker: 'assistant',
            content: reply,
          })
          if (insErr) aiError = 'insert failed: ' + insErr.message
        } else {
          aiError = 'AI returned empty content'
        }
      } catch (e) {
        aiError = e instanceof Error ? e.message : String(e)
      }
    }
  } catch (e) {
    aiError = e instanceof Error ? e.message : String(e)
    console.error('[chat-widget] AI reply failed:', aiError)
  } finally {
    // Persist session metadata (lead_created flag etc.) best-effort.
    try {
      await db.from('call_sessions').update({ metadata: sessionMeta }).eq('id', dbSessionId)
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true, sessionId, dbSessionId, leadCreated: Boolean(leadHandoffText) })
}

/**
 * Validate + insert the extracted lead, notify the broker (in-app + email),
 * following the same pattern as app/api/public/seller-intake/route.ts.
 * Deduplicates by email within the target table (mirrors capturePublicLead).
 */
async function createLeadFromExtraction(
  db: ReturnType<typeof createServerClient>,
  agencyId: string,
  extraction: ChatLeadExtraction,
): Promise<{ ok: boolean; duplicate?: boolean }> {
  if (!db || !extraction.kind || !extraction.name || !extraction.email) return { ok: false }
  const table = extraction.kind === 'seller' ? ('seller_leads' as const) : ('buyer_leads' as const)

  try {
    const { data: dupe } = await db.from(table).select('id').ilike('email', extraction.email).limit(1)
    if (dupe && dupe.length > 0) return { ok: true, duplicate: true }
  } catch { /* dedupe best-effort — fall through to insert */ }

  const leadErr =
    extraction.kind === 'seller'
      ? (
          await db.from('seller_leads').insert({
            agency_id: agencyId,
            full_name: extraction.name,
            email: extraction.email,
            phone: extraction.phone || null,
            business_name: extraction.business_name || null,
            industry: extraction.industry || null,
            revenue_range: extraction.revenue_range || null,
            location_general: extraction.location || null,
            timeframe: extraction.timeframe || null,
            message: [
              extraction.reason_for_selling ? `Reason for selling: ${extraction.reason_for_selling}` : '',
              extraction.asking_price ? `Thinking of asking: ${extraction.asking_price}` : '',
            ].filter(Boolean).join(' | ') || 'Captured via AI chat widget.',
            source: 'chat_widget',
            status: 'new',
          })
        ).error
      : (
          await db.from('buyer_leads').insert({
            agency_id: agencyId,
            full_name: extraction.name,
            email: extraction.email,
            phone: extraction.phone || null,
            budget_range: extraction.budget_range || null,
            industries_interest: extraction.industries_interest || null,
            preferred_location: extraction.preferred_location || extraction.location || null,
            timeframe: extraction.timeframe || null,
            message: 'Captured via AI chat widget.',
            status: 'new',
          })
        ).error

  if (leadErr) {
    console.error('[chat-widget] lead insert failed:', leadErr.message)
    return { ok: false }
  }

  // In-app notification.
  await createNotification({
    agency_id: agencyId,
    title: `New ${extraction.kind} inquiry (chat): ${extraction.business_name || extraction.name}`,
    body: `${extraction.name} (${extraction.email})${extraction.phone ? ` · ${extraction.phone}` : ''}${extraction.industry ? ` · ${extraction.industry}` : ''} — captured by the AI chat widget.`,
    kind: 'review',
    link: '/leads',
  }).catch(() => {})

  // Email alert to the broker inbox — same pattern as seller-intake.
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
  try {
    await notify('generic', 'info@ezbusinessadvisors.com', {
      title: `New ${extraction.kind} inquiry (chat): ${esc(extraction.business_name || extraction.name)}`,
      message: [
        `Name: ${esc(extraction.name)}`,
        `Email: ${esc(extraction.email)}`,
        extraction.phone ? `Phone: ${esc(extraction.phone)}` : '',
        extraction.business_name ? `Business: ${esc(extraction.business_name)}` : '',
        extraction.industry ? `Industry: ${esc(extraction.industry)}` : '',
        extraction.revenue_range ? `Revenue: ${esc(extraction.revenue_range)}` : '',
        extraction.location ? `Location: ${esc(extraction.location)}` : '',
        extraction.reason_for_selling ? `Reason for selling: ${esc(extraction.reason_for_selling)}` : '',
        extraction.timeframe ? `Timeline: ${esc(extraction.timeframe)}` : '',
        extraction.budget_range ? `Budget: ${esc(extraction.budget_range)}` : '',
        'Source: AI chat widget (public site)',
      ].filter(Boolean).join('<br/>'),
    })
  } catch { /* best-effort */ }

  return { ok: true }
}
