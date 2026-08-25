// =============================================================================
// Onboarding — two systems share this module:
//   1) Agent Onboarding checklist (training) — onboarding_steps/tasks tables.
//   2) Agency Onboarding (new): AI-guided first-week setup after a plan
//      conversion. Convert → payment confirmed → owner gets a "create your
//      login" invite email → /onboarding wizard with an AI bot → "I'm good".
// =============================================================================

import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// 1) Agent onboarding checklist (existing)
// ---------------------------------------------------------------------------

export interface OnboardingStep {
  id: string
  title: string
  description: string | null
  step_key: string
  icon: string | null
  order: number
  is_required: boolean
}

export interface OnboardingTask {
  id: string
  broker_id: string
  step_id: string
  completed: boolean
  completed_at: string | null
  progress: number
  // joined
  step?: OnboardingStep
}

export interface OnboardingSummary {
  steps: OnboardingStep[]
  tasks: OnboardingTask[]
  total: number
  completed: number
  requiredTotal: number
  requiredCompleted: number
  pct: number
}

export async function fetchOnboardingSteps(): Promise<OnboardingStep[]> {
  const { data, error } = await supabase
    .from('onboarding_steps')
    .select('*')
    .order('order', { ascending: true })
  if (error) throw new Error(error.message || 'Failed to load onboarding steps')
  return (data as OnboardingStep[]) || []
}

export async function fetchOnboardingTasks(brokerId: string): Promise<OnboardingTask[]> {
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .select('*, onboarding_steps(*)')
    .eq('broker_id', brokerId)
  if (error) throw new Error(error.message || 'Failed to load onboarding tasks')
  const rows = (data || []) as Array<OnboardingTask & { onboarding_steps?: OnboardingStep | null }>
  return rows.map((r) => ({ ...r, step: r.onboarding_steps ?? undefined }))
}

// Load both + compute progress. Ensures a task row exists for every required step.
export async function fetchOnboardingSummary(brokerId: string): Promise<OnboardingSummary> {
  const [steps, tasks] = await Promise.all([fetchOnboardingSteps(), fetchOnboardingTasks(brokerId)])
  const existing = new Set(tasks.map((t) => t.step_id))
  // Create missing task rows for steps the broker hasn't started yet.
  const missing = steps.filter((s) => !existing.has(s.id))
  if (missing.length) {
    for (const s of missing) {
      await supabase
        .from('onboarding_tasks')
        .upsert({ broker_id: brokerId, step_id: s.id, completed: false, progress: 0 }, { onConflict: 'broker_id,step_id' })
        .select()
    }
  }
  const fresh = missing.length ? await fetchOnboardingTasks(brokerId) : tasks
  const latest = missing.length ? fresh : tasks
  const required = steps.filter((s) => s.is_required)
  const done = latest.filter((t) => t.completed).map((t) => t.step_id)
  const requiredDone = required.filter((s) => done.includes(s.id)).length
  const pct = required.length ? Math.round((requiredDone / required.length) * 100) : 100
  return {
    steps,
    tasks: latest,
    total: steps.length,
    completed: done.length,
    requiredTotal: required.length,
    requiredCompleted: requiredDone,
    pct,
  }
}

export async function upsertOnboardingTask(
  brokerId: string,
  stepId: string,
  opts: { completed?: boolean; progress?: number }
) {
  const completed = opts.completed ?? (opts.progress !== undefined ? opts.progress >= 100 : false)
  const progress = Math.max(0, Math.min(100, opts.progress ?? (completed ? 100 : 0)))
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .upsert({
      broker_id: brokerId,
      step_id: stepId,
      completed,
      progress,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'broker_id,step_id' })
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update onboarding')
  return data
}

// ---------------------------------------------------------------------------
// 2) Agency onboarding — AI-guided first-week setup after plan conversion.
// ---------------------------------------------------------------------------

export interface AgencyOnboardingStep {
  key: string
  label: string
  done: boolean
}

export interface AgencyOnboarding {
  id: string
  agency_id: string
  owner_email: string
  status: 'invited' | 'active' | 'completed'
  plan_type: string | null
  amount_paid: number | null
  current_step: number
  steps: AgencyOnboardingStep[]
  invite_sent_at: string | null
  activated_at: string | null
  completed_at: string | null
  week_ends_at: string | null
  created_at?: string | null
}

/** The default guided checklist — order matters. */
export const DEFAULT_ONBOARDING_STEPS: { key: string; label: string }[] = [
  { key: 'profile', label: 'Set up your profile (name, photo, role)' },
  { key: 'agency', label: 'Brand your agency (name, logo, colors)' },
  { key: 'api_key', label: 'Connect your own AI provider API key' },
  { key: 'first_listing', label: 'Add your first listing' },
  { key: 'team', label: 'Invite your team' },
  { key: 'billing', label: 'Review billing & plan' },
]

export const STEP_LINKS: Record<string, string> = {
  profile: '/dashboard/settings',
  agency: '/dashboard/settings',
  api_key: '/dashboard/settings',
  first_listing: '/dashboard/listings/new',
  team: '/dashboard/agents',
  billing: '/dashboard/settings',
}

export const STEP_HELP: Record<string, string> = {
  profile: 'Click "Set up your profile" to add your name, photo and role. This is what buyers and your team see.',
  agency: 'Add your agency name, logo and brand colors so every document and your public site carries your identity.',
  api_key: 'Add your own AI provider API key (DeepSeek, OpenAI, Anthropic) so your CRM uses YOUR account and costs stay yours.',
  first_listing: 'Create your first listing — the 10-step guided workflow walks you from legal docs to going live.',
  team: 'Invite brokers and agents to your agency with their own logins and roles.',
  billing: 'Confirm your plan, payment method and invoice details are correct.',
}

export async function fetchAgencyOnboarding(agencyId?: string): Promise<AgencyOnboarding | null> {
  let q = supabase.from('agency_onboarding').select('*').order('created_at', { ascending: false }).limit(1)
  if (agencyId) q = q.eq('agency_id', agencyId)
  const { data, error } = await q
  if (error) return null
  return (data?.[0] as AgencyOnboarding) || null
}

export async function markAgencyStepDone(stepKey: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { data: onboard } = await supabase.from('agency_onboarding').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!onboard) return { ok: false, error: 'No onboarding found' }

  const steps: AgencyOnboardingStep[] = onboard.steps || []
  const idx = steps.findIndex((s) => s.key === stepKey)
  if (idx >= 0 && !steps[idx].done) steps[idx].done = true
  const nextStep = steps.findIndex((s) => !s.done)

  const { error } = await supabase
    .from('agency_onboarding')
    .update({ steps, current_step: nextStep === -1 ? steps.length : nextStep, updated_at: new Date().toISOString() })
    .eq('id', onboard.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function completeAgencyOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in' }
  const { data: onboard } = await supabase.from('agency_onboarding').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!onboard) return { ok: false, error: 'No onboarding found' }

  const steps: AgencyOnboardingStep[] = (onboard.steps || []).map((s: AgencyOnboardingStep) => ({ ...s, done: true }))
  const { error } = await supabase
    .from('agency_onboarding')
    .update({
      steps,
      status: 'completed',
      current_step: steps.length,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', onboard.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Days remaining in the guided week (null if not started). */
export function agencyDaysRemaining(o: AgencyOnboarding | null): number | null {
  if (!o?.week_ends_at || o.status === 'completed') return null
  const end = new Date(o.week_ends_at).getTime()
  const days = Math.ceil((end - Date.now()) / 86400000)
  return Math.max(0, days)
}
