/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Email Template Library
// -----------------------------------------------------------------------------
// One-click professional emails with {{variable}} placeholders. Rendered per
// recipient and sent through the platform email queue (SMTP when configured).
// Server-only; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { notify } from './email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

export interface TemplateVariable {
  name: string
  label: string
}

export interface EmailTemplate {
  id: string
  agency_id: string
  name: string
  category: string
  subject: string
  body: string
  variables: TemplateVariable[]
  is_system: boolean
}

/** Seed the standard template library for an agency (idempotent). */
export async function seedTemplates(agencyId: string): Promise<{ ok: boolean; error?: string; seeded?: number }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data, error } = await svc.rpc('seed_email_templates', { p_agency_id: agencyId })
  if (error) return { ok: false, error: error.message }
  return { ok: true, seeded: (data as number) || 0 }
}

/** List templates for an agency, optionally by category. */
export async function listTemplates(agencyId: string, category?: string): Promise<EmailTemplate[]> {
  if (!svc) return []
  let query = svc.from('email_templates').select('*').eq('agency_id', agencyId)
  if (category && category !== 'all') query = query.eq('category', category)
  const { data } = await query.order('category', { ascending: true }).order('name', { ascending: true })
  return (data || []) as EmailTemplate[]
}

/** Create or update a template. */
export async function saveTemplate(
  input: { agency_id: string; id?: string | null; name: string; category?: string; subject: string; body: string; variables?: TemplateVariable[] },
): Promise<{ ok: boolean; error?: string; template?: Record<string, unknown> }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  if (!input.name?.trim() || !input.subject?.trim() || !input.body?.trim()) {
    return { ok: false, error: 'name, subject, and body are required' }
  }
  const payload = {
    agency_id: input.agency_id,
    name: input.name.trim(),
    category: input.category || 'general',
    subject: input.subject.trim(),
    body: input.body,
    variables: input.variables || [],
    updated_at: new Date().toISOString(),
  }
  let result
  if (input.id) {
    result = await svc.from('email_templates').update(payload).eq('id', input.id).select().maybeSingle()
  } else {
    result = await svc.from('email_templates').insert(payload).select().maybeSingle()
  }
  if (result?.error) return { ok: false, error: result.error.message }
  return { ok: true, template: result?.data as Record<string, unknown> }
}

/** Delete a template (system templates cannot be deleted). */
export async function deleteTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  if (!svc) return { ok: false, error: 'Database is not configured' }
  const { data: tpl } = await svc.from('email_templates').select('is_system').eq('id', templateId).maybeSingle()
  if (tpl?.is_system) return { ok: false, error: 'System templates cannot be deleted' }
  const { error } = await svc.from('email_templates').delete().eq('id', templateId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Replace {{var}} placeholders with values. Unknown placeholders are left intact. */
export function renderTemplate(template: Pick<EmailTemplate, 'subject' | 'body'>, vars: Record<string, string>): { subject: string; body: string } {
  const sub = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m))
  return { subject: sub(template.subject), body: sub(template.body) }
}

/** Send a rendered template through the platform email queue. */
export async function sendTemplate(
  template: Pick<EmailTemplate, 'subject' | 'body'>,
  to: string,
  vars: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!to || !to.includes('@')) return { ok: false, error: 'A valid recipient email is required' }
  const { subject, body } = renderTemplate(template, vars)
  const result = await notify('generic', to, { title: subject, message: body.replace(/\n/g, '<br/>') })
  if (!result.ok) return { ok: false, error: result.reason || 'Send failed' }
  return { ok: true }
}
