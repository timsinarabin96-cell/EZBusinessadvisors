/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { SCENARIOS, gradeSimulator, type SimulatorScenario } from '@/lib/dealSimulator'

export const runtime = 'nodejs'

/**
 * /api/training/simulator
 *
 * GET  ?id=sunrise-laundromat — public scenario (financials + hints), with
 *      the hidden answer stripped. Defaults to the first scenario.
 * POST { id, sde, multiple } — grade the broker's recast + multiple.
 *      Deterministic scoring; optionally an AI feedback pass on top.
 */
function publicScenario(s: SimulatorScenario) {
  return {
    id: s.id,
    title: s.title,
    industry: s.industry,
    location: s.location,
    asking_hint: s.asking_hint,
    financials: s.financials,
    multiple_band: s.multiple_band,
    notes: s.notes,
  }
}

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const id = req.nextUrl.searchParams.get('id') || SCENARIOS[0].id
  const scenario = SCENARIOS.find((s) => s.id === id) || SCENARIOS[0]
  return NextResponse.json({ ok: true, scenario: publicScenario(scenario) })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const id = String(body?.id || SCENARIOS[0].id)
  const sde = Number(body?.sde)
  const multiple = Number(body?.multiple)
  if (!Number.isFinite(sde) || !Number.isFinite(multiple) || sde <= 0 || multiple <= 0) {
    return NextResponse.json({ ok: false, error: 'sde and multiple must be positive numbers' }, { status: 400 })
  }

  const scenario = SCENARIOS.find((s) => s.id === id)
  if (!scenario) return NextResponse.json({ ok: false, error: 'Unknown scenario' }, { status: 404 })

  const grade = gradeSimulator(scenario, sde, multiple)

  // Optional AI feedback pass — enhances the deterministic grade with
  // broker-grade coaching when DeepSeek is configured.
  let aiFeedback: string | null = null
  if (grade.score < 100) {
    try {
      const { completeWithDeepSeek, isDeepSeekConfigured } = await import('@/lib/deepseek/client')
      if (isDeepSeekConfigured()) {
        const result = await completeWithDeepSeek({
          context: {
            kind: 'training',
            entityId: scenario.id,
            text: `Scenario: ${scenario.title} (${scenario.industry}, ${scenario.location}). Financials: ${JSON.stringify(scenario.financials)}. Defensible multiple band: ${scenario.multiple_band[0]}-${scenario.multiple_band[1]}x SDE. Correct recast SDE: $${scenario.answer.sde.toLocaleString()}.`,
          },
          message: `The broker recast SDE at $${sde.toLocaleString()} and chose ${multiple}x. Grade: ${grade.score}/100. Give 2-3 sentences of concrete coaching on recasting SDE or multiple selection.`,
          system: 'You are a senior CBI instructor grading a deal-simulator exercise. Be specific, encouraging, and practical. Under 120 words.',
          maxTokens: 300,
        })
        aiFeedback = result.text
      }
    } catch {
      aiFeedback = null // AI pass is best-effort
    }
  }

  return NextResponse.json({ ok: true, grade, aiFeedback })
}
