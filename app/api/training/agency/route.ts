import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import {
  addAgencyTrainingModule,
  archiveAgencyTrainingModule,
  ensureAgencyTrainingProgram,
  moveAgencyTrainingModule,
  syncDefaultTrainingModules,
  updateAgencyTrainingModule,
  validateMaterial,
  type TrainingMaterial,
} from '@/lib/agencyTraining'
import { authenticateProfileRequest, canManageTeam, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const DOCUMENTS_BUCKET = 'documents'
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

async function authorize(req: NextRequest, agencyId: string) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return { response: unauthorizedResponse() }
  if (!agencyId || !canManageTeam(auth, agencyId)) return { response: forbiddenResponse() }
  return { auth }
}

async function programOverview(database: any, agencyId: string) {
  const program = await ensureAgencyTrainingProgram(database, agencyId)
  if (program.use_default_templates) await syncDefaultTrainingModules(database, program.id)
  const [{ data: agency }, { data: modules, error }] = await Promise.all([
    database.from('agencies').select('name').eq('id', agencyId).maybeSingle(),
    database.from('agency_training_modules')
      .select('id, template_id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, order, is_required, materials, created_at, updated_at')
      .eq('program_id', program.id).is('archived_at', null).order('order'),
  ])
  if (error) throw new Error(error.message)

  const hydratedModules = await Promise.all((modules || []).map(async (module: any) => ({
    ...module,
    materials: await Promise.all((module.materials || []).map(async (material: TrainingMaterial) => {
      if (!material.storagePath) return material
      const { data } = await database.storage.from(DOCUMENTS_BUCKET).createSignedUrl(material.storagePath, 3600)
      return { ...material, url: data?.signedUrl || null }
    })),
  })))
  return { agencyName: agency?.name || 'Your agency', program, modules: hydratedModules }
}

async function syncModuleTasks(database: any, programId: string, moduleId: string) {
  const { data: enrollments, error } = await database.from('agency_training_enrollments').select('id').eq('program_id', programId)
  if (error) throw new Error(error.message)
  if (!enrollments?.length) return
  const { error: taskError } = await database.from('agency_training_tasks').upsert(enrollments.map((enrollment: any) => ({
    enrollment_id: enrollment.id,
    module_id: moduleId,
  })), { onConflict: 'enrollment_id,module_id', ignoreDuplicates: true })
  if (taskError) throw new Error(taskError.message)
}

async function ensureRequiredTasks(database: any, programId: string, useDefaultTemplates: boolean) {
  let moduleQuery = database.from('agency_training_modules').select('id').eq('program_id', programId).eq('is_required', true).is('archived_at', null)
  if (!useDefaultTemplates) moduleQuery = moduleQuery.is('template_id', null)
  const [{ data: modules, error: moduleError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    moduleQuery,
    database.from('agency_training_enrollments').select('id').eq('program_id', programId),
  ])
  if (moduleError) throw new Error(moduleError.message)
  if (enrollmentError) throw new Error(enrollmentError.message)
  if (!modules?.length || !enrollments?.length) return
  const rows = enrollments.flatMap((enrollment: any) => modules.map((module: any) => ({ enrollment_id: enrollment.id, module_id: module.id })))
  const { error } = await database.from('agency_training_tasks').upsert(rows, { onConflict: 'enrollment_id,module_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

export async function GET(req: NextRequest) {
  const database = createServerClient()
  if (!database) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships.find((membership) => canManageTeam(auth, membership.agency_id))?.agency_id || ''
  if (!agencyId || !canManageTeam(auth, agencyId)) return forbiddenResponse()
  try {
    return NextResponse.json({ ok: true, agencyId, ...await programOverview(database, agencyId) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not load training program' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const database = createServerClient()
  if (!database) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) return uploadMaterial(req, database)

  const body = await req.json().catch(() => ({}))
  const agencyId = String(body.agencyId || '').trim()
  const authorization = await authorize(req, agencyId)
  if (authorization.response) return authorization.response

  try {
    const program = await ensureAgencyTrainingProgram(database, agencyId)
    const action = String(body.action || '')
    if (action === 'add-module') {
      const module = await addAgencyTrainingModule(database, program.id, body.module)
      if (body.module?.isRequired !== false) await syncModuleTasks(database, program.id, module.id)
    } else if (action === 'update-module') {
      const moduleId = String(body.moduleId || '')
      await updateAgencyTrainingModule(database, program.id, moduleId, body.module)
      if (body.module?.isRequired !== false) await syncModuleTasks(database, program.id, moduleId)
    } else if (action === 'delete-module') {
      await archiveAgencyTrainingModule(database, program.id, String(body.moduleId || ''))
    } else if (action === 'reorder') {
      const direction = body.direction === 'down' ? 'down' : 'up'
      await moveAgencyTrainingModule(database, program.id, String(body.moduleId || ''), direction)
    } else if (action === 'set-default-mode') {
      const useDefaultTemplates = body.useDefaultTemplates !== false
      const { error } = await database.from('agency_training_programs').update({ use_default_templates: useDefaultTemplates }).eq('id', program.id).eq('agency_id', agencyId)
      if (error) throw new Error(error.message)
      if (useDefaultTemplates) await syncDefaultTrainingModules(database, program.id)
      await ensureRequiredTasks(database, program.id, useDefaultTemplates)
    } else if (action === 'reset-to-default') {
      await syncDefaultTrainingModules(database, program.id, true)
      await ensureRequiredTasks(database, program.id, true)
    } else if (action === 'attach-material') {
      await attachMaterial(database, program.id, String(body.moduleId || ''), validateMaterial(body.material))
    } else {
      return NextResponse.json({ ok: false, error: 'Unknown training action' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, agencyId, ...await programOverview(database, agencyId) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update training program'
    const status = /required|options|answer|not found|cannot|URL|type/i.test(message) ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}

async function attachMaterial(database: any, programId: string, moduleId: string, material: Omit<TrainingMaterial, 'id' | 'createdAt'>) {
  const { data: module, error } = await database.from('agency_training_modules').select('id, materials')
    .eq('id', moduleId).eq('program_id', programId).is('archived_at', null).maybeSingle()
  if (error) throw new Error(error.message)
  if (!module) throw new Error('Module not found')
  const materials = [...(module.materials || []), { ...material, id: randomUUID(), createdAt: new Date().toISOString() }]
  const { error: updateError } = await database.from('agency_training_modules').update({ materials, updated_at: new Date().toISOString() })
    .eq('id', moduleId).eq('program_id', programId)
  if (updateError) throw new Error(updateError.message)
}

async function uploadMaterial(req: NextRequest, database: any) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Expected multipart form data' }, { status: 400 })
  const agencyId = String(form.get('agencyId') || '').trim()
  const moduleId = String(form.get('moduleId') || '').trim()
  const title = String(form.get('title') || '').trim()
  const file = form.get('file')
  const authorization = await authorize(req, agencyId)
  if (authorization.response) return authorization.response
  if (!(file instanceof File) || !moduleId || !title) return NextResponse.json({ ok: false, error: 'Module, title, and file are required' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: 'File is over 50 MB' }, { status: 413 })
  if (!file.type.startsWith('video/') && file.type !== 'application/pdf') return NextResponse.json({ ok: false, error: 'Only PDF and video files are supported' }, { status: 400 })

  try {
    const program = await ensureAgencyTrainingProgram(database, agencyId)
    const { data: module } = await database.from('agency_training_modules').select('id').eq('id', moduleId).eq('program_id', program.id).is('archived_at', null).maybeSingle()
    if (!module) return NextResponse.json({ ok: false, error: 'Module not found' }, { status: 404 })
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'lesson-material'
    const storagePath = `agency/${agencyId}/training/${moduleId}/${Date.now()}-${safeName}`
    const { error } = await database.storage.from(DOCUMENTS_BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
    if (error) throw new Error(error.message)
    await attachMaterial(database, program.id, moduleId, validateMaterial({
      title,
      kind: file.type === 'application/pdf' ? 'pdf' : 'video',
      storagePath,
      mimeType: file.type,
    }))
    return NextResponse.json({ ok: true, agencyId, ...await programOverview(database, agencyId) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not upload material' }, { status: 500 })
  }
}
