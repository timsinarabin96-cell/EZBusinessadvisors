import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { applyActivity, tierForXp, nextTier, TIER_LABEL, TIER_ICON, type GamificationRow, type GamificationActivity } from '@/lib/trainingGamification'

export const runtime = 'nodejs'

/**
 * /api/training/gamification
 *
 * GET  — the caller's gamification state (XP, streak, tier, next tier).
 * POST — record an activity: { activity: 'lesson_complete' | 'quiz_pass' |
 *        'module_certified' | 'program_certified' }. Computes the delta
 *        server-side (streak math is authoritative here, not the client).
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data } = await db.from('training_gamification').select('*').eq('broker_id', auth.user.id).maybeSingle()
  const state: GamificationRow = data || { xp: 0, current_streak: 0, best_streak: 0, modules_certified: 0, program_certified: false, last_active_at: null }
  const tier = tierForXp(state.xp)
  return NextResponse.json({
    ok: true,
    state,
    tier,
    tierLabel: TIER_LABEL[tier],
    tierIcon: TIER_ICON[tier],
    next: nextTier(state.xp),
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const activity = String(body?.activity || '')
  const VALID = ['lesson_complete', 'quiz_pass', 'module_certified', 'program_certified']
  if (!VALID.includes(activity)) {
    return NextResponse.json({ ok: false, error: `activity must be one of ${VALID.join('|')}` }, { status: 400 })
  }

  const { data: existing } = await db.from('training_gamification').select('*').eq('broker_id', auth.user.id).maybeSingle()
  const state: GamificationRow = existing || { xp: 0, current_streak: 0, best_streak: 0, modules_certified: 0, program_certified: false, last_active_at: null }

  const delta = applyActivity(state, activity as GamificationActivity, state.last_active_at)

  const nextState = {
    xp: state.xp + delta.xp,
    current_streak: delta.current_streak,
    best_streak: delta.best_streak,
    modules_certified: state.modules_certified + (activity === 'module_certified' ? 1 : 0),
    program_certified: state.program_certified || activity === 'program_certified',
    last_active_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data: saved, error } = await db
    .from('training_gamification')
    .upsert({ broker_id: auth.user.id, ...nextState }, { onConflict: 'broker_id' })
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const tier = tierForXp((saved as any)?.xp ?? nextState.xp)
  return NextResponse.json({
    ok: true,
    delta,
    state: saved || nextState,
    tier,
    tierLabel: TIER_LABEL[tier],
    tierIcon: TIER_ICON[tier],
    next: nextTier((saved as any)?.xp ?? nextState.xp),
  })
}
