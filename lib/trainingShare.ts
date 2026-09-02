import { ensureAgencyTrainingProgram, listActiveProgramModules, syncDefaultTrainingModules } from '@/lib/agencyTraining'

export const ONBOARDING_DASHBOARD_PATH = '/dashboard/onboarding'

function generateInviteToken() {
  const random = new Uint8Array(18)
  crypto.getRandomValues(random)
  return Array.from(random, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 24)
}

export async function ensureProfileTrainingEnrollment(database: any, agencyId: string, profileId: string) {
  const program = await ensureAgencyTrainingProgram(database, agencyId)
  const programId = program.id
  if (program.use_default_templates) await syncDefaultTrainingModules(database, programId)

  let { data: enrollment, error: enrollmentError } = await database.from('agency_training_enrollments')
    .select('id, status, training_hold, completed_at').eq('program_id', programId).eq('profile_id', profileId).maybeSingle()
  if (enrollmentError) throw new Error(enrollmentError.message)
  const created = !enrollment
  if (!enrollment) {
    const result = await database.from('agency_training_enrollments').insert({
      agency_id: agencyId,
      program_id: programId,
      profile_id: profileId,
      status: 'assigned',
      training_hold: true,
    }).select('id, status, training_hold, completed_at').single()
    if (result.error) throw new Error(result.error.message)
    enrollment = result.data
  }

  const modules = (await listActiveProgramModules(database, programId, program.use_default_templates, 'id, is_required'))
    .filter((module: any) => module.is_required)
  if (modules?.length) {
    const { error } = await database.from('agency_training_tasks').upsert(modules.map((module: any) => ({
      enrollment_id: enrollment.id,
      module_id: module.id,
    })), { onConflict: 'enrollment_id,module_id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }

  if (enrollment.status !== 'completed') {
    await Promise.all([
      database.from('agency_training_enrollments').update({ training_hold: true, updated_at: new Date().toISOString() }).eq('id', enrollment.id),
      database.from('profiles').update({ onboarding_required: true }).eq('id', profileId),
    ])
  }

  return { enrollmentId: enrollment.id, programId, created, status: enrollment.status, moduleCount: modules?.length || 0 }
}

export async function ensureAgentInvite(database: any, input: { agencyId: string; email: string; createdBy: string }) {
  const normalizedEmail = input.email.trim().toLowerCase()
  const { data: existing } = await database.from('invite_tokens')
    .select('id, token, expires_at').eq('agency_id', input.agencyId).eq('target_type', 'agent')
    .eq('email', normalizedEmail).eq('status', 'sent').gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (existing) return { ...existing, created: false }

  const token = generateInviteToken()
  const { data, error } = await database.from('invite_tokens').insert({
    token,
    target_type: 'agent',
    agency_id: input.agencyId,
    email: normalizedEmail,
    created_by: input.createdBy,
    status: 'sent',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).select('id, token, expires_at').single()
  if (error) throw new Error(error.message)
  return { ...data, created: true }
}
