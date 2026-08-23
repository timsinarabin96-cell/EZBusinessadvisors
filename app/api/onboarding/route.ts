import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, canAccessProfile, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

// ---------------------------------------------------------------------------
// Onboarding API — summary + task upsert. Runs server-side with the service
// role so task rows are created for any broker without exposing the key.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

// GET /api/onboarding?brokerId=... — steps + tasks + progress summary
export async function GET(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()
  const brokerId = req.nextUrl.searchParams.get('brokerId') || ''
  if (!brokerId) return NextResponse.json({ ok: false, error: 'missing brokerId' }, { status: 400 })
  if (!(await canAccessProfile(authenticated, brokerId))) return forbiddenResponse()
  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const [stepsRes, tasksRes] = await Promise.all([
    svc.from('onboarding_steps').select('*').order('order', { ascending: true }),
    svc.from('onboarding_tasks').select('*, onboarding_steps(*)').eq('broker_id', brokerId),
  ])
  const steps = stepsRes.data || []
  const tasks = (tasksRes.data || []) as any[]

  // Ensure a row exists for every step.
  const existing = new Set(tasks.map((t) => t.step_id))
  const missing = steps.filter((s) => !existing.has(s.id))
  if (missing.length) {
    await Promise.all(
      missing.map((s) =>
        svc.from('onboarding_tasks').upsert(
          { broker_id: brokerId, step_id: s.id, completed: false, progress: 0 },
          { onConflict: 'broker_id,step_id' },
        ).select(),
      ),
    )
  }
  const finalTasks = missing.length
    ? (await svc.from('onboarding_tasks').select('*, onboarding_steps(*)').eq('broker_id', brokerId)).data || []
    : tasks

  const required = steps.filter((s) => s.is_required)
  const done = new Set(finalTasks.filter((t) => t.completed).map((t) => t.step_id))
  const requiredDone = required.filter((s) => done.has(s.id)).length
  const pct = required.length ? Math.round((requiredDone / required.length) * 100) : 100

  return NextResponse.json({
    ok: true,
    steps,
    tasks: finalTasks,
    summary: {
      total: steps.length,
      completed: done.size,
      requiredTotal: required.length,
      requiredCompleted: requiredDone,
      pct,
    },
  })
}

// POST /api/onboarding — upsert a task state
export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()
  const body = await req.json().catch(() => ({}))
  const { brokerId, stepId, completed, progress } = body
  if (!brokerId || !stepId) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!(await canAccessProfile(authenticated, brokerId))) return forbiddenResponse()
  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const isDone = completed ?? (progress !== undefined ? progress >= 100 : false)
  const prog = Math.max(0, Math.min(100, progress ?? (isDone ? 100 : 0)))

  const { data, error } = await svc
    .from('onboarding_tasks')
    .upsert({
      broker_id: brokerId,
      step_id: stepId,
      completed: isDone,
      progress: prog,
      completed_at: isDone ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'broker_id,step_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, task: data })
}
