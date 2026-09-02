/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { AgentContextPayload } from '@/types/ai'
import type { InternalMessage } from '@/lib/claude/client'
import { withRetry, errorStatus } from '@/lib/aiRetry'

export class DeepSeekConfigError extends Error {
  constructor() {
    super('DEEPSEEK_API_KEY is not configured on the server.')
    this.name = 'DeepSeekConfigError'
  }
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY)
}

export async function completeWithDeepSeek({
  context,
  history = [],
  message,
  system,
  jsonMode = false,
  maxTokens = 1024,
  tenant,
}: {
  context: AgentContextPayload
  history?: InternalMessage[]
  message: string
  system: string
  jsonMode?: boolean
  maxTokens?: number
  /** Per-tenant overrides — used when a sold CRM plugs in its OWN API key. */
  tenant?: { apiKey?: string; baseUrl?: string; model?: string }
}): Promise<{ text: string; data?: Record<string, unknown>; usage?: { input: number; output: number } }> {
  const apiKey = tenant?.apiKey || process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new DeepSeekConfigError()

  // Rate-limit armor: 429 / 5xx / network drops retry with exponential backoff
  // (attempts=4 → ~0.8s, ~1.6s, ~3.2s of breathing room before giving up).
  const response = await withRetry(
    async () => {
      const res = await fetch(`${tenant?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: tenant?.model || process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: `${system}\n\n${jsonMode ? 'Return only a valid JSON object.' : 'Respond concisely and directly.'}` },
            { role: 'user', content: `[Verified CRM context]\n${context.text}` },
            ...history.slice(-12),
            { role: 'user', content: message },
          ],
          thinking: { type: 'disabled' },
          max_tokens: maxTokens,
          response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
          stream: false,
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) {
        const err = new Error(`DeepSeek request failed with status ${res.status}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }
      return res
    },
    { attempts: 4, onRetry: (e, attempt) => console.warn(`[deepseek] retry ${attempt} after:`, (e as Error)?.message) },
  )
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const text = payload.choices?.[0]?.message?.content?.trim() || ''
  let data: Record<string, unknown> | undefined
  if (jsonMode && text) {
    try { data = JSON.parse(text) as Record<string, unknown> } catch {}
  }
  return {
    text,
    data,
    usage: payload.usage ? { input: payload.usage.prompt_tokens || 0, output: payload.usage.completion_tokens || 0 } : undefined,
  }
}

/**
 * Generic single-turn DeepSeek chat completion (no CRM context bundle).
 * Used by marketing/design generators that only need a system + user prompt.
 */
export async function chatWithDeepSeek({
  system,
  userMessage,
  jsonMode = false,
  maxTokens = 1200,
  history = [],
  tenant,
}: {
  system: string
  userMessage: string
  jsonMode?: boolean
  maxTokens?: number
  /** Prior turns (oldest→newest) so follow-ups like "Yes" carry context. */
  history?: InternalMessage[]
  /** Per-tenant overrides — used when a sold CRM plugs in its OWN API key. */
  tenant?: { apiKey?: string; baseUrl?: string; model?: string }
}): Promise<{ text: string; data?: Record<string, unknown> }> {
  const apiKey = tenant?.apiKey || process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new DeepSeekConfigError()

  const response = await withRetry(
    async () => {
      const res = await fetch(`${tenant?.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: tenant?.model || process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: `${system}\n\n${jsonMode ? 'Return only a valid JSON object.' : 'Respond concisely and directly.'}` },
            ...history.slice(-12),
            { role: 'user', content: userMessage },
          ],
          thinking: { type: 'disabled' },
          max_tokens: maxTokens,
          response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
          stream: false,
        }),
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) {
        const err = new Error(`DeepSeek request failed with status ${res.status}`) as Error & { status?: number }
        err.status = res.status
        throw err
      }
      return res
    },
    { attempts: 4, onRetry: (e, attempt) => console.warn(`[deepseek] chat retry ${attempt} after:`, (e as Error)?.message) },
  )
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  const text = payload.choices?.[0]?.message?.content?.trim() || ''
  let data: Record<string, unknown> | undefined
  if (jsonMode && text) {
    try { data = JSON.parse(text) as Record<string, unknown> } catch {}
  }
  return { text, data }
}
