/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/ai/sensitiveProvider.ts — Claude-first routing for SENSITIVE payloads.
// -----------------------------------------------------------------------------
// 09-01 audit: DeepSeek previously received data we should not send it —
// call transcripts (PII), listing financials (asking/revenue/SDE/EBITDA),
// lead names + interaction summaries, data-room file indexes, expense
// vendor/description lines, caller booking messages.
//
// DeepSeek retention posture: no zero-data-retention offering, data processed
// in China, standard API terms only. Anthropic: no-training standard terms +
// optional ZDR (env-gated). So any payload that could carry financial or
// PII-level data MUST route to Claude when it is configured.
//
// These helpers prefer Claude and fall back to DeepSeek ONLY when Claude is
// NOT configured (e.g. a white-label tenant that plugged in its own DeepSeek
// key and no Anthropic key) — preserving tenant functionality while keeping
// the platform's sensitive flows on Claude by default.
// =============================================================================

import { complete, isClaudeConfigured, type InternalMessage } from '@/lib/claude/client'
import { completeWithDeepSeek, chatWithDeepSeek, isDeepSeekConfigured } from '@/lib/deepseek/client'
import type { AgentContextPayload } from '@/types/ai'

/** True when ANY sensitive-capable provider is configured (Claude preferred). */
export function isSensitiveAiConfigured(): boolean {
  return isClaudeConfigured() || isDeepSeekConfigured()
}

export interface SensitiveChatInput {
  system: string
  userMessage: string
  jsonMode?: boolean
  maxTokens?: number
  /** Per-tenant overrides — only honored when Claude is NOT configured. */
  tenant?: { apiKey?: string; baseUrl?: string; model?: string }
}

export interface SensitiveCompleteInput {
  context: AgentContextPayload
  history?: InternalMessage[]
  message: string
  system: string
  jsonMode?: boolean
  maxTokens?: number
  /** Per-tenant overrides — only honored when Claude is NOT configured. */
  tenant?: { apiKey?: string; baseUrl?: string; model?: string }
}

/**
 * Chat-shaped sensitive call (system + userMessage). Routes to Claude when
 * configured, otherwise DeepSeek (tenant fallback), otherwise throws.
 */
export async function chatSensitive({
  system,
  userMessage,
  jsonMode = false,
  maxTokens = 1200,
  tenant,
}: SensitiveChatInput): Promise<{ text: string; data?: Record<string, unknown> }> {
  if (isClaudeConfigured()) {
    const res = await complete({
      context: { kind: 'support', entityId: undefined, text: '' },
      message: userMessage,
      system,
      jsonMode,
      maxTokens,
    })
    return { text: res.text, data: res.data }
  }
  return chatWithDeepSeek({ system, userMessage, jsonMode, maxTokens, tenant })
}

/**
 * Context-shaped sensitive call (context bundle + history). Routes to Claude
 * when configured, otherwise DeepSeek (tenant fallback), otherwise throws.
 */
export async function completeSensitive({
  context,
  history = [],
  message,
  system,
  jsonMode = false,
  maxTokens = 1024,
  tenant,
}: SensitiveCompleteInput): Promise<{ text: string; data?: Record<string, unknown>; usage?: { input: number; output: number } }> {
  if (isClaudeConfigured()) {
    return complete({ context, history, message, system, jsonMode, maxTokens })
  }
  return completeWithDeepSeek({ context, history, message, system, jsonMode, maxTokens, tenant })
}
