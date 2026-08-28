/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/bovClaude.ts — SERVER-ONLY. Full Claude enrichment for the Broker
// Opinion of Value. Takes the deterministic 12-method BovContent and uses
// Claude to write a genuinely senior-M&A-grade Executive Summary and Market &
// Industry narrative, replacing the templated text. Falls back to the
// deterministic content on ANY failure — the BOV is never blocked by AI.
// =============================================================================

import { complete, isClaudeConfigured } from '@/lib/claude/client'
import type { AgentContextPayload } from '@/types/ai'
import type { BovContent } from '@/lib/bov'

/**
 * Enrich the BOV narrative sections with full Claude. Best-effort:
 * on any error (or no API key), returns the input unchanged.
 */
export async function enrichBovWithClaude(
  content: BovContent,
  facts: AgentContextPayload,
): Promise<BovContent> {
  if (!isClaudeConfigured()) return content
  try {
    const res = await complete({
      context: facts,
      system:
        'You are a senior M&A advisor at a boutique business brokerage writing a Broker Opinion of Value. ' +
        'Write with the polish of an investment-bank offering memorandum. Be specific, confident, and grounded ' +
        'in the provided figures. Never invent numbers outside the context. Return PLAIN TEXT only.',
      message: [
        'Write two sections for the BOV, separated by a line containing exactly "---SECTION2---":',
        '',
        'SECTION 1 — EXECUTIVE SUMMARY (4-6 sentences): transaction overview, key investment highlights, and offering summary, referencing the actual revenue, SDE/EBITDA, asking price, and valuation range.',
        '',
        'SECTION 2 — MARKET & INDUSTRY ANALYSIS (4-6 sentences): industry backdrop, sale multiples context, competitive landscape, and growth outlook for the subject business.',
      ].join('\n'),
      maxTokens: 1400,
    })

    const text = (res.text || '').trim()
    const [execPart, marketPart] = text.split('---SECTION2---').map((s) => s.trim())
    if (!execPart || !marketPart) return content

    const out: BovContent = {
      ...content,
      sections: content.sections.map((s) => {
        if (s.id === 'executive-summary') {
          return { ...s, subsections: [{ heading: 'Transaction Overview (AI-prepared)', body: [execPart] }] }
        }
        if (s.id === 'market-industry') {
          return { ...s, subsections: [{ heading: 'Market & Industry Analysis (AI-prepared)', body: [marketPart] }] }
        }
        return s
      }),
    }
    return out
  } catch {
    return content // never block the BOV on AI failure
  }
}
