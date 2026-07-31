// =============================================================================
// Training Center — types + Supabase data layer
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// --- Types ---
export interface TrainingModule {
  id: string
  title: string
  description: string | null
  icon: string | null
  order: number
  is_published: boolean
  created_at?: string | null
  // joined/derived
  lessons?: TrainingLesson[]
  lesson_count?: number
  completed_count?: number
  progress_pct?: number
  certified?: boolean
}

export interface TrainingLesson {
  id: string
  module_id: string
  title: string
  content: string | null
  video_url: string | null
  pdf_url: string | null
  order: number
  duration_minutes: number
  is_published: boolean
  created_at?: string | null
  // derived
  completed?: boolean
  quiz_count?: number
}

export interface QuizQuestion {
  id: string
  lesson_id: string
  question: string
  options: string[]
  correct_answer: string
  created_at?: string | null
}

export interface TrainingProgress {
  id: string
  broker_id: string
  lesson_id: string
  completed: boolean
  completed_at: string | null
  rating: number | null
  created_at?: string | null
}

export interface TrainingCertificate {
  id: string
  broker_id: string
  module_id: string
  certificate_url: string | null
  issued_at: string | null
}

export interface TrainingUpload {
  id: string
  broker_id: string
  title: string
  file_url: string
  file_type: string
  module_id: string | null
  uploaded_at: string | null
}

// --- Modules + lessons ---
export async function fetchModules(): Promise<TrainingModule[]> {
  const { data, error } = await supabase
    .from('training_modules')
    .select('*')
    .eq('is_published', true)
    .order('order', { ascending: true })
  if (error) throw new Error(error.message || 'Failed to load training modules')
  return (data as TrainingModule[]) || []
}

export async function fetchModule(id: string): Promise<TrainingModule | null> {
  const { data, error } = await supabase
    .from('training_modules')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return (data as TrainingModule) || null
}

export async function fetchLessons(moduleId: string): Promise<TrainingLesson[]> {
  const { data, error } = await supabase
    .from('training_lessons')
    .select('*')
    .eq('module_id', moduleId)
    .eq('is_published', true)
    .order('order', { ascending: true })
  if (error) throw new Error(error.message || 'Failed to load lessons')
  return (data as TrainingLesson[]) || []
}

export async function fetchLesson(id: string): Promise<TrainingLesson | null> {
  const { data, error } = await supabase
    .from('training_lessons')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return (data as TrainingLesson) || null
}

export async function fetchQuiz(lessonId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('training_quiz_questions')
    .select('*')
    .eq('lesson_id', lessonId)
  if (error) throw new Error(error.message || 'Failed to load quiz')
  return (data as QuizQuestion[]) || []
}

// --- Progress ---
export async function fetchProgress(brokerId: string): Promise<TrainingProgress[]> {
  const { data, error } = await supabase
    .from('training_progress')
    .select('*')
    .eq('broker_id', brokerId)
  if (error) throw new Error(error.message || 'Failed to load progress')
  return (data as TrainingProgress[]) || []
}

export async function markLessonComplete(brokerId: string, lessonId: string, rating?: number) {
  const { data, error } = await supabase
    .from('training_progress')
    .upsert({
      broker_id: brokerId,
      lesson_id: lessonId,
      completed: true,
      completed_at: new Date().toISOString(),
      rating: rating ?? null,
    }, { onConflict: 'broker_id,lesson_id' })
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to save progress')
  return data
}

// --- Certificates ---
export async function fetchCertificates(brokerId: string): Promise<TrainingCertificate[]> {
  const { data, error } = await supabase
    .from('training_certificates')
    .select('*')
    .eq('broker_id', brokerId)
  if (error) throw new Error(error.message || 'Failed to load certificates')
  return (data as TrainingCertificate[]) || []
}

export async function saveCertificate(brokerId: string, moduleId: string, certUrl?: string) {
  const { data, error } = await supabase
    .from('training_certificates')
    .upsert({
      broker_id: brokerId,
      module_id: moduleId,
      certificate_url: certUrl ?? null,
      issued_at: new Date().toISOString(),
    }, { onConflict: 'broker_id,module_id' })
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to save certificate')
  return data
}

// Helper: if all lessons in a module are complete, issue a certificate
export async function ensureModuleCertificate(brokerId: string, module: TrainingModule, lessons: TrainingLesson[], progress: TrainingProgress[]) {
  if (!lessonModuleComplete(lessons, progress)) return
  await saveCertificate(brokerId, module.id)
}

export function lessonModuleComplete(lessons: TrainingLesson[], progress: TrainingProgress[]): boolean {
  if (!lessons.length) return false
  const completedIds = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id))
  return lessons.every((l) => completedIds.has(l.id))
}

// --- Uploads ---
export async function fetchUploads(brokerId?: string): Promise<TrainingUpload[]> {
  let q = supabase.from('training_uploads').select('*').order('uploaded_at', { ascending: false })
  if (brokerId) q = q.eq('broker_id', brokerId)
  const { data, error } = await q
  if (error) throw new Error(error.message || 'Failed to load uploads')
  return (data as TrainingUpload[]) || []
}

export async function createUpload(input: { broker_id: string; title: string; file_url: string; file_type: string; module_id?: string }) {
  const { data, error } = await supabase.from('training_uploads').insert({
    broker_id: input.broker_id,
    title: input.title,
    file_url: input.file_url,
    file_type: input.file_type,
    module_id: input.module_id || null,
  }).select().single()
  if (error) throw new Error(error.message || 'Failed to upload')
  return data
}
