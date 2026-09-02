import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { canManageAgency, type AuthenticatedProfileRequest } from '@/lib/supabase/auth'
import { evaluateTrainingState, type TrainingGateResult } from '@/lib/trainingGateCore'

export { evaluateTrainingState } from '@/lib/trainingGateCore'

export type TrainingProgramKind = 'onboarding'
export async function requireTraining(
  profileId: string,
  agencyId: string,
  program: TrainingProgramKind,
  database: any = createServerClient(),
): Promise<TrainingGateResult> {
  if (!database) return { ok: false, reason: 'Training status is unavailable.', link: '/dashboard/onboarding' }
  if (program !== 'onboarding') return { ok: false, reason: 'Unknown training program.' }

  const [{ data: profile, error: profileError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
    database.from('profiles').select('onboarding_required').eq('id', profileId).maybeSingle(),
    database.from('agency_training_enrollments')
      .select('status, training_hold')
      .eq('profile_id', profileId)
      .eq('agency_id', agencyId)
      .maybeSingle(),
  ])
  if (profileError || enrollmentError) {
    return { ok: false, reason: 'Training status could not be verified.', link: '/dashboard/onboarding' }
  }
  return evaluateTrainingState(profile, enrollment)
}

export async function trainingGateResponse(input: {
  database: any
  auth: AuthenticatedProfileRequest
  agencyId: string
  body?: Record<string, any>
  action: string
  targetType: string
  targetId?: string | null
}): Promise<NextResponse | null> {
  const result = await requireTraining(input.auth.profile.id, input.agencyId, 'onboarding', input.database)
  if (result.ok) return null

  const reason = String(input.body?.trainingOverrideReason || '').trim()
  if (canManageAgency(input.auth, input.agencyId) && reason.length >= 10) {
    await input.database.from('admin_audit_log').insert({
      actor_id: input.auth.user.id,
      actor_email: input.auth.user.email || null,
      action: 'training_gate_override',
      target_type: input.targetType,
      target_id: input.targetId || null,
      details: { program: 'onboarding', gated_action: input.action, reason },
    })
    return null
  }

  return NextResponse.json({
    ok: false,
    blocked: true,
    error: result.reason,
    trainingRequired: true,
    link: result.link,
    override: canManageAgency(input.auth, input.agencyId)
      ? 'Admins may provide trainingOverrideReason (minimum 10 characters); the override is audited.'
      : undefined,
  }, { status: 403 })
}
