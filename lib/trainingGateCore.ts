export type TrainingGateResult = { ok: boolean; reason?: string; link?: string }

export function evaluateTrainingState(
  profile: { onboarding_required?: boolean | null } | null,
  enrollment: { status?: string | null; training_hold?: boolean | null } | null,
): TrainingGateResult {
  if (!profile?.onboarding_required) return { ok: true }
  if (enrollment?.status === 'completed' && enrollment.training_hold === false) return { ok: true }
  return {
    ok: false,
    reason: 'Complete your required agency onboarding before taking this action.',
    link: '/dashboard/onboarding',
  }
}

