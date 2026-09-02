import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { generateOnboardingCertificate } from '@/lib/agentOnboarding'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const { data: enrollment } = await db.from('agency_training_enrollments')
    .select('id, status, training_hold, completed_at, certificate_storage_path, program_id')
    .eq('profile_id', auth.profile.id).eq('agency_id', agencyId).maybeSingle()
  if (!enrollment) return NextResponse.json({ ok: true, required: false, modules: [] })
  const { data: program } = await db.from('agency_training_programs').select('use_default_templates').eq('id', enrollment.program_id).maybeSingle()
  let moduleQuery = db.from('agency_training_modules')
    .select('id, title, description, lesson_content, quiz_question, quiz_options, order, materials')
    .eq('program_id', enrollment.program_id).eq('is_required', true).is('archived_at', null)
  if (program?.use_default_templates === false) moduleQuery = moduleQuery.is('template_id', null)
  const [{ data: modules }, { data: tasks }] = await Promise.all([
    moduleQuery.order('order'),
    db.from('agency_training_tasks').select('id, module_id, completed, quiz_score, completed_at').eq('enrollment_id', enrollment.id),
  ])
  let certificateUrl: string | null = null
  if (enrollment.certificate_storage_path) {
    const { data } = await db.storage.from('documents').createSignedUrl(enrollment.certificate_storage_path, 3600)
    certificateUrl = data?.signedUrl || null
  }
  const taskByModule = new Map((tasks || []).map((task: any) => [task.module_id, task]))
  const hydratedModules = await Promise.all((modules || []).map(async (module: any) => ({
    ...module,
    materials: await Promise.all((module.materials || []).map(async (material: any) => {
      if (!material.storagePath) return material
      const { data } = await db.storage.from('documents').createSignedUrl(material.storagePath, 3600)
      return { ...material, url: data?.signedUrl || null }
    })),
    task: taskByModule.get(module.id) || null,
  })))
  return NextResponse.json({
    ok: true, required: true, enrollment: { ...enrollment, certificateUrl },
    modules: hydratedModules,
  })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const moduleId = String(body.moduleId || '')
  const answer = String(body.answer || '')
  if (!moduleId || !answer) return NextResponse.json({ ok: false, error: 'moduleId and answer are required' }, { status: 400 })

  const { data: enrollment } = await db.from('agency_training_enrollments').select('id, program_id')
    .eq('profile_id', auth.profile.id).eq('agency_id', agencyId).maybeSingle()
  if (!enrollment) return NextResponse.json({ ok: false, error: 'Onboarding enrollment not found' }, { status: 404 })
  const { data: program } = await db.from('agency_training_programs').select('use_default_templates').eq('id', enrollment.program_id).maybeSingle()
  let moduleQuery = db.from('agency_training_modules').select('id, quiz_correct_answer')
    .eq('id', moduleId).eq('program_id', enrollment.program_id).eq('is_required', true).is('archived_at', null)
  if (program?.use_default_templates === false) moduleQuery = moduleQuery.is('template_id', null)
  const { data: module } = await moduleQuery.maybeSingle()
  if (!module) return NextResponse.json({ ok: false, error: 'Module not found' }, { status: 404 })
  const passed = answer === module.quiz_correct_answer
  if (!passed) return NextResponse.json({ ok: true, passed: false, score: 0 })

  await db.from('agency_training_tasks').update({ completed: true, quiz_score: 100, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('enrollment_id', enrollment.id).eq('module_id', moduleId)
  await db.from('agency_training_enrollments').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', enrollment.id).neq('status', 'completed')
  let activeModuleQuery = db.from('agency_training_modules').select('id')
    .eq('program_id', enrollment.program_id).eq('is_required', true).is('archived_at', null)
  if (program?.use_default_templates === false) activeModuleQuery = activeModuleQuery.is('template_id', null)
  const { data: activeModules } = await activeModuleQuery
  const activeModuleIds = (activeModules || []).map((activeModule: any) => activeModule.id)
  const { count } = activeModuleIds.length
    ? await db.from('agency_training_tasks').select('id', { count: 'exact', head: true }).eq('enrollment_id', enrollment.id).in('module_id', activeModuleIds).eq('completed', false)
    : { count: 0 }
  let certificate = null
  if (count === 0) certificate = await generateOnboardingCertificate(db, enrollment.id)
  return NextResponse.json({ ok: true, passed: true, score: 100, completed: count === 0, certificate })
}
