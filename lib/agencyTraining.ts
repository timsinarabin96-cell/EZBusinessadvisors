export type TrainingMaterial = {
  id: string
  title: string
  kind: 'pdf' | 'video' | 'document' | 'link'
  url?: string
  storagePath?: string
  mimeType?: string
  createdAt: string
}

export type AgencyTrainingModuleInput = {
  title: string
  description: string | null
  lessonContent: string
  quizQuestion: string
  quizOptions: string[]
  quizCorrectAnswer: string
  order?: number
  isRequired: boolean
}

const MATERIAL_KINDS = new Set(['pdf', 'video', 'document', 'link'])

export function validateModuleInput(input: any): AgencyTrainingModuleInput {
  const title = String(input?.title || '').trim()
  const description = String(input?.description || '').trim() || null
  const lessonContent = String(input?.lessonContent || input?.lesson_content || '').trim()
  const quizQuestion = String(input?.quizQuestion || input?.quiz_question || '').trim()
  const quizOptions = Array.isArray(input?.quizOptions || input?.quiz_options)
    ? (input.quizOptions || input.quiz_options).map((option: unknown) => String(option).trim()).filter(Boolean)
    : []
  const quizCorrectAnswer = String(input?.quizCorrectAnswer || input?.quiz_correct_answer || '').trim()
  const requestedOrder = Number(input?.order)
  const order = Number.isInteger(requestedOrder) && requestedOrder > 0 ? requestedOrder : undefined

  if (!title || !lessonContent || !quizQuestion) throw new Error('Title, lesson content, and quiz question are required')
  if (quizOptions.length < 2 || quizOptions.length > 8) throw new Error('Quiz options must contain between 2 and 8 choices')
  if (new Set(quizOptions).size !== quizOptions.length) throw new Error('Quiz options must be unique')
  if (!quizOptions.includes(quizCorrectAnswer)) throw new Error('Correct answer must match one quiz option')
  return { title, description, lessonContent, quizQuestion, quizOptions, quizCorrectAnswer, order, isRequired: input?.isRequired !== false && input?.is_required !== false }
}

export function validateMaterial(input: any): Omit<TrainingMaterial, 'id' | 'createdAt'> {
  const title = String(input?.title || '').trim()
  const kind = String(input?.kind || '').trim() as TrainingMaterial['kind']
  const url = String(input?.url || '').trim() || undefined
  const storagePath = String(input?.storagePath || '').trim() || undefined
  const mimeType = String(input?.mimeType || '').trim() || undefined
  if (!title || !MATERIAL_KINDS.has(kind)) throw new Error('Material title and a valid type are required')
  if (!url && !storagePath) throw new Error('Material URL or uploaded file is required')
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Material URL must start with http:// or https://')
  return { title, kind, url, storagePath, mimeType }
}

export async function ensureAgencyTrainingProgram(database: any, agencyId: string) {
  const { data, error } = await database.from('agency_training_programs').upsert({
    agency_id: agencyId,
    kind: 'onboarding',
    title: 'Agent Platform Onboarding',
    is_active: true,
  }, { onConflict: 'agency_id,kind' }).select('id, use_default_templates, title').limit(1)
  if (error) throw new Error(error.message)
  const program = data?.[0]
  if (!program?.id) throw new Error('Could not create onboarding program')
  return { ...program, use_default_templates: program.use_default_templates !== false }
}

export async function syncDefaultTrainingModules(database: any, programId: string, refreshExisting = false) {
  const [{ data: templates, error: templateError }, { data: existing, error: moduleError }] = await Promise.all([
    database.from('onboarding_module_templates')
      .select('id, title, description, lesson_content, quiz_question, quiz_options, quiz_correct_answer, order')
      .eq('is_active', true).order('order'),
    database.from('agency_training_modules').select('id, template_id, order, archived_at').eq('program_id', programId),
  ])
  if (templateError) throw new Error(templateError.message)
  if (moduleError) throw new Error(moduleError.message)

  const existingByTemplate = new Map((existing || []).filter((module: any) => module.template_id).map((module: any) => [module.template_id, module]))
  let nextOrder = Math.max(0, ...(existing || []).filter((module: any) => !module.archived_at).map((module: any) => Number(module.order) || 0)) + 1
  let added = 0
  let restored = 0
  for (const template of templates || []) {
    const module = existingByTemplate.get(template.id) as any
    if (module) {
      if (module.archived_at) {
        const { error } = await database.from('agency_training_modules').update({ archived_at: null, order: nextOrder++, updated_at: new Date().toISOString() }).eq('id', module.id)
        if (error) throw new Error(error.message)
        restored += 1
      } else if (refreshExisting) {
        const { error } = await database.from('agency_training_modules').update({
          title: template.title,
          description: template.description,
          lesson_content: template.lesson_content,
          quiz_question: template.quiz_question,
          quiz_options: template.quiz_options,
          quiz_correct_answer: template.quiz_correct_answer,
          is_required: true,
          updated_at: new Date().toISOString(),
        }).eq('id', module.id)
        if (error) throw new Error(error.message)
      }
      continue
    }
    const desiredOrder = (existing || []).some((candidate: any) => !candidate.archived_at && candidate.order === template.order) ? nextOrder++ : template.order
    const { error } = await database.from('agency_training_modules').insert({
      program_id: programId,
      template_id: template.id,
      title: template.title,
      description: template.description,
      lesson_content: template.lesson_content,
      quiz_question: template.quiz_question,
      quiz_options: template.quiz_options,
      quiz_correct_answer: template.quiz_correct_answer,
      order: desiredOrder,
      is_required: true,
    })
    if (error) throw new Error(error.message)
    added += 1
  }
  return { added, restored }
}

export async function listActiveProgramModules(database: any, programId: string, useDefaultTemplates: boolean, select = 'id') {
  let query = database.from('agency_training_modules').select(select).eq('program_id', programId).is('archived_at', null)
  if (!useDefaultTemplates) query = query.is('template_id', null)
  const { data, error } = await query.order('order')
  if (error) throw new Error(error.message)
  return data || []
}

export async function addAgencyTrainingModule(database: any, programId: string, input: any) {
  const module = validateModuleInput(input)
  const { data: rows, error: listError } = await database.from('agency_training_modules')
    .select('order').eq('program_id', programId).is('archived_at', null).order('order', { ascending: false }).limit(1)
  if (listError) throw new Error(listError.message)
  const order = module.order || (Number(rows?.[0]?.order) || 0) + 1
  const { data, error } = await database.from('agency_training_modules').insert({
    program_id: programId,
    template_id: null,
    title: module.title,
    description: module.description,
    lesson_content: module.lessonContent,
    quiz_question: module.quizQuestion,
    quiz_options: module.quizOptions,
    quiz_correct_answer: module.quizCorrectAnswer,
    order,
    is_required: module.isRequired,
  }).select('id, order').single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateAgencyTrainingModule(database: any, programId: string, moduleId: string, input: any) {
  const module = validateModuleInput(input)
  const { data: existing, error: findError } = await database.from('agency_training_modules')
    .select('id, template_id').eq('id', moduleId).eq('program_id', programId).is('archived_at', null).maybeSingle()
  if (findError) throw new Error(findError.message)
  if (!existing) throw new Error('Module not found')
  if (existing.template_id) throw new Error('Default template modules cannot be edited')
  const { data, error } = await database.from('agency_training_modules').update({
    title: module.title,
    description: module.description,
    lesson_content: module.lessonContent,
    quiz_question: module.quizQuestion,
    quiz_options: module.quizOptions,
    quiz_correct_answer: module.quizCorrectAnswer,
    ...(module.order ? { order: module.order } : {}),
    is_required: module.isRequired,
    updated_at: new Date().toISOString(),
  }).eq('id', moduleId).eq('program_id', programId).select('id, order').single()
  if (error) throw new Error(error.message)
  return data
}

export async function archiveAgencyTrainingModule(database: any, programId: string, moduleId: string) {
  const { data: existing, error: findError } = await database.from('agency_training_modules')
    .select('id, template_id').eq('id', moduleId).eq('program_id', programId).is('archived_at', null).maybeSingle()
  if (findError) throw new Error(findError.message)
  if (!existing) throw new Error('Module not found')
  if (existing.template_id) throw new Error('Default template modules cannot be deleted')
  const { error } = await database.from('agency_training_modules').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', moduleId).eq('program_id', programId)
  if (error) throw new Error(error.message)
}

export async function moveAgencyTrainingModule(database: any, programId: string, moduleId: string, direction: 'up' | 'down') {
  const { data: modules, error } = await database.from('agency_training_modules')
    .select('id, order').eq('program_id', programId).is('archived_at', null).order('order')
  if (error) throw new Error(error.message)
  const index = (modules || []).findIndex((module: any) => module.id === moduleId)
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0) throw new Error('Module not found')
  if (swapIndex < 0 || swapIndex >= modules.length) return modules
  const current = modules[index]
  const swap = modules[swapIndex]
  const temporaryOrder = -Math.max(Date.now(), Math.abs(Number(current.order)) + Math.abs(Number(swap.order)) + 1)
  for (const [id, order] of [[current.id, temporaryOrder], [swap.id, current.order], [current.id, swap.order]]) {
    const { error: updateError } = await database.from('agency_training_modules').update({ order, updated_at: new Date().toISOString() }).eq('id', id).eq('program_id', programId)
    if (updateError) throw new Error(updateError.message)
  }
  return modules
}
