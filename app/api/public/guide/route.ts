/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { completeSensitive, isSensitiveAiConfigured } from '@/lib/ai/sensitiveProvider'
import {rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

const GUIDE_SYSTEM = `You are Concord's friendly website guide. You help visitors understand what to do on the platform.

ABOUT THE PLATFORM:
- Concord is a business-for-sale marketplace + brokerage CRM.
- Buyers: browse listings at /marketplace/listings, filter by industry/location/price, view full details (financials, operations, real estate included, financing), request confidential details, get SBA financing estimates, compare businesses, and contact the listing broker directly.
- Sellers: use /marketplace/sell to see how to list a business, get a valuation, and reach a broker.
- Professionals (attorneys, CPAs, brokers, lenders): join the network at /join to add their own profile with photo and contact info so buyers and brokers can reach them. They can subscribe/unsubscribe themselves anytime.
- The CRM (/dashboard or /auth) is for brokers and agency staff: manage listings, pipeline, documents, AI agents, client portal, and more. Account creation is at /auth/signup (choose Broker/Agency for the CRM workspace).

GUIDELINES:
- Be warm, concise, and helpful. Use short paragraphs or bullets.
- Guide visitors to the right page: buyers → marketplace listings; sellers → sell page; professionals → /join; brokers → /auth/signup or /auth.
- If they ask about a specific feature you're unsure of, point them to the marketplace or the contact page.
- Never invent pricing details. Never share confidential listing data.
- Keep answers under ~120 words unless they ask for details.`

const CRM_SYSTEM = `You are Concord CRM's built-in assistant, embedded in the broker's dashboard (bottom-right popup). You help brokers and agents use the platform.

CRM FEATURES (broker/agent side):
- Dashboard: today's deals, tasks, pipeline snapshot.
- Listings: create (/dashboard/listings/new), edit (/dashboard/listings/:id/edit), workflow steps, publish (Save & Go Live on the edit page — pushes to the public website instantly), readiness score, transition status (active/under contract/sold).
- Deal Pipeline: stages, LOI, negotiation, closing, data room.
- AI agents: /dashboard/intelligence, /dashboard/command-center, AI chat for leads/training/documents.
- Documents: CIM/BOV generators, financial files, templates, client portal.
- Leads: buyer leads, seller leads, NDA requests, visitor intent, saved searches.
- Professionals network: add/invite attorneys, CPAs, lenders via invite link (they fill their own profile).
- Marketing: social, newspaper, email templates, marketing orders.
- Billing/Admin: agency settings, trials, users, commissions.
- Other tools: deal doctor, red flags, readiness, valuation, comps, watchlist, referrals, reminders, calendar, communications, training, certificates.

GUIDELINES:
- Be concise, practical, and specific — tell them exactly which tab/menu to open and what to click.
- If asked about a feature, name the page and the key actions (e.g., "Go to Listings → New Listing, fill the form, then hit Save & Go Live").
- Never invent settings or pricing. If unsure, suggest checking the relevant dashboard section.
- Keep answers under ~140 words unless they ask for details.`

/**
 * POST /api/public/guide — DeepSeek-powered guide bot for the public website.
 *   { message, history?, mode?: 'public' | 'crm' }
 * No auth required. Rate-limit friendly; keeps the payload small.
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: public endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  if (!isSensitiveAiConfigured()) {
    return NextResponse.json({ ok: false, error: 'Guide bot is not configured yet.' }, { status: 503 })
  }

  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 }) }
  const message = String(body?.message || '').trim().slice(0, 800)
  if (!message) return NextResponse.json({ ok: false, error: 'Message is required' }, { status: 400 })
  const mode = body?.mode === 'crm' ? 'crm' : 'public'

  const history = Array.isArray(body?.history)
    ? body.history.slice(-8).map((h: any) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content || '').slice(0, 800),
      }))
    : []

  try {
    const result = await completeSensitive({
      context: { kind: 'support', text: mode === 'crm' ? 'User is inside the Concord CRM dashboard.' : 'Visitor is on the public Concord website.' },
      history,
      message,
      system: mode === 'crm' ? CRM_SYSTEM : GUIDE_SYSTEM,
      maxTokens: 400,
    })
    return NextResponse.json({ ok: true, text: result.text })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Guide bot failed' }, { status: 500 })
  }
}
