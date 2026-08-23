// =============================================================================
// Nurture Drips
// -----------------------------------------------------------------------------
// Default buyer/seller email sequences plus the enrollment + drip-advance
// engine. Each recipient is enrolled in a sequence; a clock (next_send_at)
// decides when the next step fires. advanceDueRecipients() sends due steps as
// deal_notification emails (queued when SMTP is unconfigured) and either bumps
// the recipient to the next step (next send in 4 days) or marks them
// completed when the sequence is exhausted. Never throws - drip delivery
// degrades gracefully.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Types ------------------------------------------------------------------
export type NurtureAudience = 'buyer' | 'seller'
export type RecipientStatus = 'active' | 'completed' | 'paused'

export interface NurtureStep {
  id: string
  day: number
  title: string
}

export interface NurtureSequence {
  id: string
  agency_id: string
  name: string
  audience: NurtureAudience
  steps: NurtureStep[]
  active: boolean
  created_at: string
}

export interface NurtureRecipient {
  id: string
  agency_id: string
  sequence_id: string
  email: string
  lead_type: string
  current_step: number
  next_send_at: string | null
  status: RecipientStatus
  created_at: string
}

const DAYS_BETWEEN_STEPS = 4
const STEP_GAP_MS = DAYS_BETWEEN_STEPS * 24 * 60 * 60 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Default sequences seeded per agency. */
export const DEFAULT_SEQUENCES: Record<NurtureAudience, { name: string; steps: NurtureStep[] }> = {
  buyer: {
    name: 'Buyer nurture',
    steps: [
      { id: 'buyer-welcome', day: 0, title: 'Welcome & deal criteria' },
      { id: 'buyer-curated', day: 3, title: 'Curated listings for you' },
      { id: 'buyer-readiness', day: 7, title: 'Buyer readiness check-in' },
    ],
  },
  seller: {
    name: 'Seller nurture',
    steps: [
      { id: 'seller-valuation', day: 0, title: 'Your business valuation' },
      { id: 'seller-roadmap', day: 3, title: 'Seller readiness roadmap' },
      { id: 'seller-strategy-call', day: 7, title: 'Listing strategy call' },
    ],
  },
}

/** Seed the two default sequences (buyer + seller) for an agency. Idempotent. */
export async function seedDefaultSequences(agencyId: string): Promise<{ ok: boolean; error?: string; created: number }> {
  if (!agencyId) return { ok: false, error: 'agencyId is required', created: 0 }
  if (!svc) return { ok: false, error: 'not configured', created: 0 }

  let created = 0
  for (const audience of Object.keys(DEFAULT_SEQUENCES) as NurtureAudience[]) {
    const spec = DEFAULT_SEQUENCES[audience]
    const { data: existing } = await svc
      .from('nurture_sequences')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('audience', audience)
      .limit(1)
      .maybeSingle()
    if (existing) continue

    const { error } = await svc.from('nurture_sequences').insert({
      agency_id: agencyId,
      name: spec.name,
      audience,
      steps: spec.steps,
      active: true,
    })
    if (!error) created++
  }
  return { ok: true, created }
}

/** Enroll a contact in a sequence; step 0 goes out immediately on the next advance. */
export async function enroll(
  sequenceId: string,
  email: string,
  leadType?: string,
): Promise<{ ok: boolean; error?: string; data?: NurtureRecipient }> {
  const cleanEmail = (email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(cleanEmail)) return { ok: false, error: 'A valid email is required' }
  if (!sequenceId) return { ok: false, error: 'sequenceId is required' }
  if (!svc) return { ok: false, error: 'not configured' }

  const { data: sequence } = await svc
    .from('nurture_sequences')
    .select('id, agency_id, active')
    .eq('id', sequenceId)
    .maybeSingle()
  if (!sequence) return { ok: false, error: 'sequence not found' }
  if (sequence.active === false) return { ok: false, error: 'sequence is inactive' }

  const { data, error } = await svc
    .from('nurture_recipients')
    .insert({
      agency_id: sequence.agency_id,
      sequence_id: sequenceId,
      email: cleanEmail,
      lead_type: leadType || 'buyer',
      current_step: 0,
      next_send_at: new Date().toISOString(), // due now -> step 0 fires on the next advance
      status: 'active',
    })
    .select()
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as NurtureRecipient }
}

/**
 * Send every due step for an agency's active recipients and advance them.
 * Step n is sent, then the recipient either moves to step n+1 (next_send_at
 * = now + 4 days) or becomes 'completed' when the sequence is exhausted.
 * Never throws - a failing recipient is skipped.
 */
export async function advanceDueRecipients(agencyId: string): Promise<{ advanced: number; completed: number }> {
  if (!svc || !agencyId) return { advanced: 0, completed: 0 }

  const { data: sequences } = await svc.from('nurture_sequences').select('*').eq('agency_id', agencyId)
  const byId = new Map<string, NurtureSequence>((sequences || []).map((s) => [s.id, s as NurtureSequence]))
  if (byId.size === 0) return { advanced: 0, completed: 0 }

  const { data: due } = await svc
    .from('nurture_recipients')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .limit(500)

  let advanced = 0
  let completed = 0

  for (const recipient of (due || []) as NurtureRecipient[]) {
    const sequence = byId.get(recipient.sequence_id)
    if (!sequence) continue
    const steps: NurtureStep[] = Array.isArray(sequence.steps) ? sequence.steps : []
    const stepIndex = recipient.current_step || 0
    if (stepIndex >= steps.length) {
      // Nothing left to send - retire the recipient.
      await svc.from('nurture_recipients').update({ status: 'completed', next_send_at: null }).eq('id', recipient.id)
      completed++
      continue
    }

    const step = steps[stepIndex]
    const nextStep = stepIndex + 1

    try {
      await notify('deal_notification', recipient.email, {
        businessName: `${sequence.name} step ${nextStep}`,
        dealStage: 'nurture',
      })
    } catch {
      // Email pipeline never throws, but stay defensive - skip and continue.
    }

    if (nextStep >= steps.length) {
      await svc.from('nurture_recipients').update({ status: 'completed', next_send_at: null }).eq('id', recipient.id)
      completed++
    } else {
      const nextSendAt = new Date(Date.now() + STEP_GAP_MS).toISOString()
      await svc.from('nurture_recipients').update({ current_step: nextStep, next_send_at: nextSendAt }).eq('id', recipient.id)
    }
    advanced++
  }

  return { advanced, completed }
}
