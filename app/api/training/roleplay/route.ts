/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { ROLEPLAY_SCENARIOS, gradeRoleplay, type RoleplayScenario } from '@/lib/negotiationRoleplay'

export const runtime = 'nodejs'

/**
 * /api/training/roleplay
 *
 * GET  ?id=family-deli-sale — the scenario brief + both role openings
 *      (no hidden answers). Defaults to the first scenario.
 * POST { id, agreedPrice } — grade the final agreed price against the
 *      defensible band + walk-away. Deterministic scoring + AI coaching.
 */
function publicScenario(s: RoleplayScenario) {
  return {
    id: s.id,
    title: s.title,
    deal: s.deal,
    asking_price: s.asking_price,
    sde: s.sde,
    fair_range: s.fair_range,
    roles: s.roles,
    tips: s.tips,
  }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const id = req.nextUrl.searchParams.get('id') || ROLEPLAY_SCENARIOS[0].id
  const scenario = ROLEPLAY_SCENARIOS.find((s) => s.id === id) || ROLEPLAY_SCENARIOS[0]
  return NextResponse.json({ ok: true, scenario: publicScenario(scenario) })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || ROLEPLAY_SCENARIOS[0].id)
  const agreedPrice = Number(body?.agreedPrice)
  if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
    return NextResponse.json({ ok: false, error: 'agreedPrice must be a positive number' }, { status: 400 })
  }

  const scenario = ROLEPLAY_SCENARIOS.find((s) => s.id === id)
  if (!scenario) return NextResponse.json({ ok: false, error: 'Unknown scenario' }, { status: 404 })

  const grade = gradeRoleplay(scenario, agreedPrice)

  // AI coaching pass on imperfect closes.
  let aiFeedback: string | null = null
  if (grade.score < 100) {
    try {
      const { completeWithDeepSeek, isDeepSeekConfigured } = await import('@/lib/deepseek/client')
      if (isDeepSeekConfigured()) {
        const result = await completeWithDeepSeek({
          context: {
            kind: 'training',
            entityId: scenario.id,
            text: `Deal: ${scenario.deal}. Asking ${scenario.asking_price}, SDE ${scenario.sde}. Fair band ${scenario.fair_range[0]}-${scenario.fair_range[1]}, walk-away ${scenario.walk_away[0]}-${scenario.walk_away[1]}. Tips: ${scenario.tips.join(' | ')}`,
          },
          message: `The broker closed at $${agreedPrice.toLocaleString()} (${grade.sdeMultiple.toFixed(1)}× SDE). Score ${grade.score}/100. Give 2-3 sentences of negotiation coaching.`,
          system: 'You are a senior M&A negotiation instructor. Be specific, practical, encouraging. Under 120 words.',
          maxTokens: 300,
        })
        aiFeedback = result.text
      }
    } catch {
      aiFeedback = null
    }
  }

  return NextResponse.json({ ok: true, grade, aiFeedback })
}
