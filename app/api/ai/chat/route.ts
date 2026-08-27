/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateServerInput } from '@cosmstack/blackshield/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { buildAgentContext } from '@/lib/claude/context'
import { complete, isClaudeConfigured, ClaudeConfigError } from '@/lib/claude/client'
import { completeWithDeepSeek, isDeepSeekConfigured, DeepSeekConfigError } from '@/lib/deepseek/client'
import { resolveTenantAiConfig, toDeepSeekTenant } from '@/lib/tenantAi'
import { buildSystemPrompt } from '@/lib/claude/prompts'
import { CLAUDE_MODELS, type AgentKind, type ClaudeModelName } from '@/types/ai'

// =============================================================================
// POST /api/ai/chat
//
// Broker → AI agent chat. The route is SERVER-ONLY: it loads real deal/training
// context from Supabase, calls Claude with the ANTHROPIC_API_KEY, and returns a
// structured response. The browser never sees the API key.
//
// Request body:
//   {
//     "agent":    "lead" | "training" | "document" | "support",
//     "message":  "the broker's prompt",
//     "entityId": optional — scopes doc/lead agents to a listing/entity,
//     "history":  optional — prior [{role:"user"|"assistant",content}] turns,
//     "json":     optional — request a structured JSON reply for the lead agent
//   }
//
// Security:
//   * Input validated against a Zod schema (bounded length, strict enum).
//   * Payload size capped before parsing.
//   * History clamped to a safe window.
//   * Errors returned as structured JSON, never leaking the API key or stack.
// =============================================================================

const MAX_BODY_BYTES = 32 * 1024 // 32 KB cap
const MAX_HISTORY = 12 // max prior turns we honor
const MAX_MESSAGE_LEN = 4000

const agentKindSchema = z.enum(['lead', 'training', 'document', 'support', 'booking', 'listing'])

const chatRequestSchema = z.object({
  agent: agentKindSchema,
  message: z.string().min(1).max(MAX_MESSAGE_LEN),
  entityId: z.string().max(80).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(MAX_MESSAGE_LEN),
      }),
    )
    .max(MAX_HISTORY)
    .optional(),
  json: z.boolean().optional(),
})

function ok(data: object, status = 200) {
  return NextResponse.json(data, { status })
}

function fail(message: string, status = 400, extra: object = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

export async function POST(req: NextRequest) {
  // SECURITY (2026-08-26 audit): AI calls burn provider credits — require a
  // valid signed-in session before touching any model. Was unauthenticated.
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  // -------------------------------------------------------------------------
  // 0) Feature availability — fail fast with a clear, non-leaky message.
  // -------------------------------------------------------------------------
  if (!isClaudeConfigured() && !isDeepSeekConfigured()) {
    return fail(
      'AI is not configured yet. Add a server-side DeepSeek or Anthropic provider.',
      503,
      { code: 'AI_NOT_CONFIGURED' },
    )
  }

  // -------------------------------------------------------------------------
  // 1) Bounded body + JSON parse
  // -------------------------------------------------------------------------
  const raw = await req.text().catch(() => '')
  if (!raw) return fail('Empty request body.', 400)
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return fail('Request too large.', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('Invalid JSON.', 400)
  }

  // -------------------------------------------------------------------------
  // 2) Validate against the Zod contract (blackshield server validator)
  // -------------------------------------------------------------------------
  const validation = validateServerInput(chatRequestSchema, body)
  if (!validation.isValid) {
    const first = Object.values(validation.errors)[0]?.[0]
    return fail(
      `That request isn't quite right — ${first || 'one of the fields is missing or invalid'}. Check the message and try again.`,
      422,
      { detail: first },
    )
  }
  const { agent, message, entityId, history, json } = body as z.infer<
    typeof chatRequestSchema
  >

  // -------------------------------------------------------------------------
  // 3) Load relevant domain context from Supabase (server-side, condensed)
  // -------------------------------------------------------------------------
  let context
  try {
    context = await buildAgentContext({ kind: agent, entityId })
  } catch (err) {
    console.error('[ai/chat] context load failed:', (err as Error)?.message)
    return fail('Failed to load context for this agent.', 500, {
      code: 'CONTEXT_FAILED',
    })
  }

  // -------------------------------------------------------------------------
  // 4) Route routine work to DeepSeek and document polish to Claude.
  // -------------------------------------------------------------------------
  // Document analysis and lead scoring benefit from the larger model; the rest
  // run fast/cheap on haiku. json mode forces the lead agent to output score JSON.
  //
  // Legal-compliance: the DOCUMENT and TRAINING agents regularly touch real-estate
  // transfers, licensed-activity disclosures, and drafted legal language, so they
  // get the state-aware legal guardrail auto-appended. Lead/support stay lean.
  const model: ClaudeModelName =
    agent === 'document' ? CLAUDE_MODELS.flagship : CLAUDE_MODELS.fast

  const legal = agent === 'document' || agent === 'training'
  const system = buildSystemPrompt(agent, { legal })

  // -------------------------------------------------------------------------
  // 4b) Booking agent — real calendar action, not just text.
  // -------------------------------------------------------------------------
  if (agent === 'booking') {
    const { extractBooking, createBooking } = await import('@/lib/booking')
    const { getAgencyContext } = await import('@/lib/agencyContext')
    const ctx = await getAgencyContext()
    if (!ctx) {
      return fail('An agency membership is required to book appointments.', 403, {
        code: 'NO_AGENCY',
      })
    }
    try {
      const extraction = await extractBooking(message)
      if (extraction.needs_confirmation || !extraction.data) {
        return ok({
          ok: false,
          agent,
          needs_confirmation: true,
          reply: extraction.question || 'Could you give me a date and time for the appointment?',
        })
      }
      const result = await createBooking(ctx.agencyId, extraction.data, {
        createdBy: ctx.userId,
        source: 'api',
      })
      if (!result.ok) {
        return fail(result.error || 'Failed to create appointment', 500, {
          code: 'BOOKING_FAILED',
        })
      }
      const conflicts = (result as { conflicts?: unknown[] }).conflicts
      const appt = result.appointment as Record<string, unknown>
      const when = new Date(String(appt.starts_at)).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      return ok({
        ok: true,
        agent,
        reply: conflicts?.length
          ? `Appointment booked for ${when} — heads up, it overlaps ${conflicts.length} existing appointment(s). Check the calendar.`
          : `Appointment booked: ${String(appt.title)} · ${when} · ${String(appt.attendee_name || 'no attendee')} (${String(appt.attendee_email || 'no email')}).`,
        data: { appointment: appt, conflicts: conflicts || [] },
        provider: 'deepseek',
      })
    } catch (err) {
      const msg = (err as Error)?.message || 'Unknown booking error'
      console.error('[ai/chat] booking failed:', msg)
      return fail('The booking service returned an error. Please try again.', 502, {
        code: 'BOOKING_CALL_FAILED',
      })
    }
  }

  // Normalize history into the client's expected (user/assistant) shape,
  // appended after the message as the live instruction.
  const turns = (history || []).map((h) => ({ role: h.role, content: h.content }))
  // Provider routing — data-handling policy:
  //   * Sensitive agents (document analysis, training, lead scoring) touch
  //     real financial/legal data → ALWAYS route through Claude (Anthropic)
  //     when configured; refuse rather than fall back to DeepSeek.
  //   * Non-sensitive agents (support, booking) run on DeepSeek for cost,
  //     falling back to Claude if DeepSeek is unconfigured.
  const sensitiveAgent = agent === 'document' || agent === 'training' || agent === 'lead'
  if (sensitiveAgent && !isClaudeConfigured()) {
    return fail('Sensitive AI agents require the Anthropic provider (financial data policy).', 503, { code: 'AI_NOT_CONFIGURED' })
  }
  const useClaude = sensitiveAgent || !isDeepSeekConfigured()

  // Per-tenant AI credentials — a sold CRM uses its OWN API key (billed to buyer).
  let tenantCfg = null
  try {
    const { getAgencyContext } = await import('@/lib/agencyContext')
    const ctx = await getAgencyContext()
    tenantCfg = await resolveTenantAiConfig(ctx?.userId)
  } catch { /* tenant resolution is best-effort */ }
  const tenant = toDeepSeekTenant(tenantCfg)

  try {
    const result = useClaude
      ? await complete({ context, history: turns, message, system, model, jsonMode: Boolean(json), maxTokens: 2048 })
      : await completeWithDeepSeek({ context, history: turns, message, system, jsonMode: Boolean(json), maxTokens: 1024, tenant })

    return ok({
      ok: true,
      agent,
      reply: result.text,
      data: result.data ?? null,
      usage: result.usage ?? null,
      provider: useClaude ? 'anthropic' : 'deepseek',
    })
  } catch (err) {
    // ClaudeConfigError (key removed mid-flight) and SDK/network errors
    if (err instanceof ClaudeConfigError || err instanceof DeepSeekConfigError) {
      return fail('AI is not configured.', 503, { code: 'AI_NOT_CONFIGURED' })
    }
    const msg = (err as Error)?.message || 'Unknown AI error'
    // Log the underlying cause server-side only; never surface to the client.
    console.error('[ai/chat] provider call failed:', msg)
    return fail('The AI service returned an error. Please try again.', 502, {
      code: 'AI_CALL_FAILED',
    })
  }
}
