import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { createNotification } from '@/lib/notifications'

const DOCUMENTS_BUCKET = 'documents'

export async function ensureAgentOnboardingForInvite(database: any, inviteId: string): Promise<void> {
  const { error } = await database.rpc('ensure_agent_onboarding_for_invite', { p_invite_id: inviteId })
  if (error) console.warn('[agent-onboarding] enrollment bootstrap skipped:', error.message)
}

export async function generateOnboardingCertificate(database: any, enrollmentId: string) {
  const { data: enrollment } = await database
    .from('agency_training_enrollments')
    .select('id, agency_id, profile_id, status, certificate_document_id, certificate_storage_path')
    .eq('id', enrollmentId)
    .maybeSingle()
  if (!enrollment?.profile_id) return { ok: false, error: 'Enrollment not found' }
  if (enrollment.certificate_document_id) return { ok: true, documentId: enrollment.certificate_document_id }

  const [{ data: agency }, { data: profile }] = await Promise.all([
    database.from('agencies').select('name').eq('id', enrollment.agency_id).maybeSingle(),
    database.from('profiles').select('full_name, email').eq('id', enrollment.profile_id).maybeSingle(),
  ])
  const agentName = profile?.full_name || profile?.email || 'Agent'
  const agencyName = agency?.name || 'Agency'
  const completionDate = new Date()

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([792, 612])
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold)
  page.drawRectangle({ x: 24, y: 24, width: 744, height: 564, borderColor: rgb(0.72, 0.57, 0.18), borderWidth: 3 })
  page.drawText('CERTIFICATE OF COMPLETION', { x: 164, y: 470, size: 28, font: serifBold, color: rgb(0.06, 0.11, 0.2) })
  page.drawText('Agent Platform Onboarding', { x: 260, y: 420, size: 18, font: serif, color: rgb(0.3, 0.3, 0.3) })
  page.drawText(agentName, { x: Math.max(80, 396 - agentName.length * 8), y: 340, size: 28, font: serifBold, color: rgb(0.72, 0.45, 0.08) })
  page.drawText(`has completed the required onboarding program for ${agencyName}`, { x: 125, y: 295, size: 15, font: serif })
  page.drawText(completionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }), { x: 305, y: 225, size: 14, font: serif })
  page.drawText('Concord Deal Platform', { x: 315, y: 90, size: 13, font: serifBold })
  const bytes = await pdf.save()
  const storagePath = `agency/${enrollment.agency_id}/onboarding-certificates/${enrollment.profile_id}-${completionDate.toISOString().slice(0, 10)}.pdf`
  const { error: uploadError } = await database.storage.from(DOCUMENTS_BUCKET).upload(storagePath, Buffer.from(bytes), {
    contentType: 'application/pdf', upsert: true,
  })
  if (uploadError) return { ok: false, error: uploadError.message }

  const { data: document, error: documentError } = await database.from('documents').insert({
    title: `Agent Onboarding Certificate — ${agentName}`,
    status: 'archived',
    created_by: enrollment.profile_id,
    filled_data: { kind: 'agent_onboarding_certificate', agency_id: enrollment.agency_id, storage_path: storagePath, completed_at: completionDate.toISOString() },
    parties: [{ role: 'agent', profile_id: enrollment.profile_id, name: agentName }],
  }).select('id').single()
  if (documentError) return { ok: false, error: documentError.message }

  await Promise.all([
    database.from('agency_training_enrollments').update({
      status: 'completed', training_hold: false, completed_at: completionDate.toISOString(),
      certificate_document_id: document.id, certificate_storage_path: storagePath, updated_at: completionDate.toISOString(),
    }).eq('id', enrollment.id),
    database.from('profiles').update({ onboarding_required: false }).eq('id', enrollment.profile_id),
    database.from('admin_audit_log').insert({
      actor_id: enrollment.profile_id,
      actor_email: profile?.email || null,
      action: 'agent_onboarding_completed',
      target_type: 'user',
      target_id: enrollment.profile_id,
      target_label: agentName,
      details: { agency_id: enrollment.agency_id, certificate_document_id: document.id, storage_path: storagePath },
    }),
  ])
  await createNotification({
    agency_id: enrollment.agency_id,
    profile_id: enrollment.profile_id,
    title: 'Onboarding complete',
    body: 'Your Agent Platform Onboarding certificate is ready in your onboarding dashboard.',
    kind: 'training',
    link: '/dashboard/onboarding',
  })
  await createNotification({
    agency_id: enrollment.agency_id,
    title: 'Agent completed onboarding',
    body: `${agentName} completed all five required onboarding modules.`,
    kind: 'training',
    link: '/dashboard/team',
  })
  return { ok: true, documentId: document.id, storagePath }
}

