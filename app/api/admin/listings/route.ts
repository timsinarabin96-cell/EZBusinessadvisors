import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'
import { assessListingRisk, RiskReport } from '@/lib/scamDetectionCore'
import { isDeepSeekConfigured, chatWithDeepSeek } from '@/lib/deepseek/client'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/listings — platform moderation queue (super admin only).
//   GET   ?stage=&q=&agencyId=&flagged= — every listing across all tenants,
//         joined with agency + owner info, with a deterministic AI risk score.
//   PATCH { id, action, reason? } — approve | reject | unpublish | flag |
//         clear_flag. Every action is audit-logged.
//   POST  { action: 'ai_scan' } — scan all listings, auto-flag critical risk.
//         { action: 'ai_review', id } — deep-dive one listing (deterministic
//         + optional DeepSeek analysis), auto-flag if critical.
// =============================================================================

const STAGES = ['pending_review', 'approved', 'rejected', 'changes_requested', 'agent_review', 'draft', 'all']
const AUTO_FLAG_SCORE = 75 // critical

const LISTING_SELECT =
  'id, business_name, headline, description, industry, status, review_stage, flagged, flag_reasons, asking_price, annual_revenue, sde, created_at, published_at, agency_id, agent_id, moderation_reason, moderated_at, city, state, image_urls'

function riskFor(listing: any, ownerCreatedAt?: string | null): RiskReport {
  return assessListingRisk({
    businessName: listing.business_name,
    headline: listing.headline,
    description: listing.description,
    industry: listing.industry,
    askingPrice: listing.asking_price,
    annualRevenue: listing.annual_revenue,
    sde: listing.sde,
    city: listing.city,
    state: listing.state,
    imageCount: Array.isArray(listing.image_urls) ? listing.image_urls.length : 0,
    listingCreatedAt: listing.created_at,
    publishedAt: listing.published_at,
    ownerCreatedAt: ownerCreatedAt || null,
    alreadyFlagged: Boolean(listing.flagged),
    flagReasons: listing.flag_reasons || null,
  })
}

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const sp = req.nextUrl.searchParams
  const stage = sp.get('stage') || 'pending_review'
  const q = (sp.get('q') || '').trim()
  const agencyId = sp.get('agencyId') || undefined
  const flagged = sp.get('flagged')
  const limit = Math.min(Number(sp.get('limit') || 100), 300)

  let query = db
    .from('listings')
    .select(LISTING_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (stage !== 'all') query = query.eq('review_stage', stage)
  if (q) query = query.ilike('business_name', `%${q}%`)
  if (agencyId) query = query.eq('agency_id', agencyId)
  if (flagged === 'true') query = query.eq('flagged', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const agencyIds = Array.from(new Set((data || []).map((l: any) => l.agency_id).filter(Boolean)))
  const profileIds = Array.from(new Set((data || []).map((l: any) => l.agent_id).filter(Boolean)))
  const [agencies, profiles] = await Promise.all([
    agencyIds.length ? db.from('agencies').select('id, name').in('id', agencyIds) : Promise.resolve({ data: [] }),
    profileIds.length ? db.from('profiles').select('id, email, full_name, created_at').in('id', profileIds) : Promise.resolve({ data: [] }),
  ])
  const agencyName = new Map((agencies.data || []).map((a: any) => [a.id, a.name]))
  const owner = new Map((profiles.data || []).map((p: any) => [p.id, p]))

  const listings = (data || []).map((l: any) => {
    const o = owner.get(l.agent_id) || {}
    const risk = riskFor(l, o.created_at)
    return {
      ...l,
      agency_name: agencyName.get(l.agency_id) || '—',
      owner_name: o.full_name || o.email || '—',
      owner_email: o.email || '—',
      riskScore: risk.score,
      riskLevel: risk.level,
      riskReasons: risk.reasons,
    }
  })
  return NextResponse.json({ ok: true, listings })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await resolveAdminActor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const action = String(body.action || '')

  // --- AI scan: all listings, auto-flag critical -------------------------------
  if (action === 'ai_scan') {
    const { data: rows, error } = await db.from('listings').select(LISTING_SELECT).order('created_at', { ascending: false }).limit(300)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    const agentIds = Array.from(new Set((rows || []).map((l: any) => l.agent_id).filter(Boolean)))
    const { data: owners } = agentIds.length
      ? await db.from('profiles').select('id, created_at').in('id', agentIds)
      : { data: [] }
    const ownerCreated = new Map((owners || []).map((p: any) => [p.id, p.created_at]))

    const flagged: string[] = []
    let maxScore = 0
    const byLevel = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const l of rows || []) {
      const risk = riskFor(l, ownerCreated.get(l.agent_id))
      maxScore = Math.max(maxScore, risk.score)
      byLevel[risk.level]++
      if (risk.score >= AUTO_FLAG_SCORE && !l.flagged) {
        const reasons = risk.reasons.slice(0, 3).join('; ')
        await db.from('listings').update({ flagged: true, flag_reasons: [`AI: ${risk.score}/100 — ${reasons}`] }).eq('id', l.id)
        flagged.push(l.business_name || l.id)
      }
    }

    await recordAdminAudit({
      actorId: actor.id, actorEmail: actor.email,
      action: 'ai_scan', targetType: 'listing', targetId: null, targetLabel: `scan of ${(rows || []).length} listings`,
      details: { scanned: (rows || []).length, auto_flagged: flagged.length, byLevel, maxScore },
    })

    return NextResponse.json({ ok: true, scanned: (rows || []).length, autoFlagged: flagged.length, byLevel, maxScore, flagged })
  }

  // --- AI review: deep-dive one listing -----------------------------------------
  if (action === 'ai_review') {
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const { data: listing } = await db.from('listings').select(LISTING_SELECT).eq('id', id).maybeSingle()
    if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

    const { data: owner } = await db.from('profiles').select('email, full_name, created_at').eq('id', listing.agent_id).maybeSingle()
    const risk = riskFor(listing, owner?.created_at || null)

    let ai: { available: boolean; text?: string; data?: Record<string, unknown>; error?: string } = { available: false }
    if (isDeepSeekConfigured()) {
      try {
        const result = await chatWithDeepSeek({
          system:
            'You are a fraud-detection expert for a business-for-sale marketplace. Assess the listing for scam risk signals: unrealistic pricing vs stated financials, vague ownership, pressure tactics, missing contact/verification info, boilerplate copy. Return JSON: {"score": 0-100, "signals": ["..."], "summary": "one short sentence"}.',
          userMessage: `Business: ${listing.business_name || '?'}\nHeadline: ${listing.headline || '—'}\nIndustry: ${listing.industry || '—'}\nAsking: $${listing.asking_price || 0}\nRevenue: $${listing.annual_revenue || 0}\nSDE: $${listing.sde || 0}\nLocation: ${[listing.city, listing.state].filter(Boolean).join(', ') || '—'}\nDescription: ${(listing.description || '').slice(0, 1200)}`,
          jsonMode: true,
          maxTokens: 600,
        })
        ai = { available: true, text: result.text, data: result.data }
      } catch (e: any) {
        ai = { available: true, error: e.message }
      }
    }

    await recordAdminAudit({
      actorId: actor.id, actorEmail: actor.email,
      action: 'ai_review', targetType: 'listing', targetId: id, targetLabel: listing.business_name || id,
      details: { riskScore: risk.score, riskLevel: risk.level, ai: ai.available ? (ai.error ? 'error' : 'done') : 'unconfigured' },
    })

    const finalScore = Math.max(risk.score, Number(ai.data?.score) || 0)
    return NextResponse.json({
      ok: true,
      listing: { id, business_name: listing.business_name, asking_price: listing.asking_price, industry: listing.industry },
      risk,
      ai,
      finalScore,
      level: finalScore >= 75 ? 'critical' : finalScore >= 55 ? 'high' : finalScore >= 30 ? 'medium' : 'low',
    })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const actor = await resolveAdminActor(req)

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }

  const id = String(body.id || '')
  const action = String(body.action || '')
  const reason = body.reason ? String(body.reason).slice(0, 500) : null
  if (!id || !action) return NextResponse.json({ ok: false, error: 'id and action required' }, { status: 400 })
  if (!['approve', 'reject', 'unpublish', 'flag', 'clear_flag'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 })
  }

  const { data: listing } = await db.from('listings').select('id, business_name, agency_id').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const now = new Date().toISOString()
  let patch: Record<string, unknown> = {}

  switch (action) {
    case 'approve':
      patch = { status: 'active', review_stage: 'approved', flagged: false, flag_reasons: [], moderation_reason: null, moderated_by: actor.id, moderated_at: now, published_at: now }
      break
    case 'reject':
      patch = { status: 'draft', review_stage: 'rejected', moderation_reason: reason || 'Rejected by platform admin', moderated_by: actor.id, moderated_at: now }
      break
    case 'unpublish':
      patch = { status: 'draft', review_stage: 'draft', moderation_reason: reason || null, moderated_by: actor.id, moderated_at: now }
      break
    case 'flag':
      patch = { flagged: true, flag_reasons: [...((listing as any).flag_reasons || []), reason || 'Flagged by platform admin'] }
      break
    case 'clear_flag':
      patch = { flagged: false, flag_reasons: [] }
      break
  }

  const { error } = await db.from('listings').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'moderate_listing', targetType: 'listing', targetId: id,
    targetLabel: listing.business_name || id,
    details: { action, reason, agencyId: listing.agency_id, to_stage: (patch.review_stage as string) || null },
  })

  return NextResponse.json({ ok: true })
}
