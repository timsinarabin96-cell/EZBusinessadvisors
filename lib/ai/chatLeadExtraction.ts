/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/ai/chatLeadExtraction.ts — turn a public chat-widget transcript into a
// validated seller/buyer lead payload.
// -----------------------------------------------------------------------------
// The AI collects details conversationally; the SERVER never trusts the
// model's free-text reply as ground truth. Instead this module makes a
// second, isolated jsonMode call asking the model to summarize what it has
// gathered so far into a strict schema, then DETERMINISTICALLY validates the
// result (email format, required fields, string coercion/trimming) before
// anything is ever inserted into seller_leads/buyer_leads. Any field that
// fails validation is dropped to null rather than trusted blindly.
// =============================================================================

export interface ChatLeadExtraction {
  kind: 'seller' | 'buyer' | null
  name: string | null
  email: string | null
  phone: string | null
  business_name: string | null
  industry: string | null
  location: string | null
  revenue_range: string | null
  reason_for_selling: string | null
  timeframe: string | null
  asking_price: string | null
  budget_range: string | null
  industries_interest: string | null
  preferred_location: string | null
  /** True once the minimum bar for creating a lead is met (name + email; kind known). */
  ready: boolean
}

const EMPTY: ChatLeadExtraction = {
  kind: null,
  name: null,
  email: null,
  phone: null,
  business_name: null,
  industry: null,
  location: null,
  revenue_range: null,
  reason_for_selling: null,
  timeframe: null,
  asking_price: null,
  budget_range: null,
  industries_interest: null,
  preferred_location: null,
  ready: false,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cleanStr(v: unknown, maxLen = 300): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().slice(0, maxLen)
  if (!s || /^(none|n\/a|na|unknown|not sure|null|undefined)$/i.test(s)) return null
  return s
}

const EXTRACTION_SYSTEM = `You extract structured lead data from a business-brokerage website chat transcript.
Read the whole conversation and output ONLY a JSON object with these exact keys (use null for anything not yet provided — do not guess or invent values):
{
  "kind": "seller" | "buyer" | null,
  "name": string|null,
  "email": string|null,
  "phone": string|null,
  "business_name": string|null,
  "industry": string|null,
  "location": string|null,
  "revenue_range": string|null,
  "reason_for_selling": string|null,
  "timeframe": string|null,
  "asking_price": string|null,
  "budget_range": string|null,
  "industries_interest": string|null,
  "preferred_location": string|null
}
"kind" is "seller" if the visitor wants to sell/list a business, "buyer" if they want to buy/acquire one, otherwise null.
Only fill a field if the visitor actually stated it in the conversation. Never fabricate an email or name.`

export interface ChatFn {
  (input: { system: string; userMessage: string; jsonMode?: boolean; maxTokens?: number }): Promise<{ text: string; data?: Record<string, unknown> }>
}

/**
 * Run the extraction call against a transcript string ("caller: ...\nassistant: ...")
 * and return a validated, safe-to-insert payload. Never throws — on any AI or
 * parsing failure it returns the EMPTY (not-ready) extraction.
 */
export async function extractLeadFromTranscript(transcriptText: string, chatFn: ChatFn): Promise<ChatLeadExtraction> {
  if (!transcriptText.trim()) return { ...EMPTY }
  try {
    const res = await chatFn({
      system: EXTRACTION_SYSTEM,
      userMessage: transcriptText.slice(0, 8000),
      jsonMode: true,
      maxTokens: 500,
    })
    const raw = res.data || safeParseJson(res.text)
    return validateExtraction(raw)
  } catch {
    return { ...EMPTY }
  }
}

function safeParseJson(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Pure, deterministic validation — exported for unit testing without any AI call. */
export function validateExtraction(raw: Record<string, unknown> | undefined | null): ChatLeadExtraction {
  if (!raw || typeof raw !== 'object') return { ...EMPTY }

  const kindRaw = cleanStr((raw as any).kind, 20)?.toLowerCase()
  const kind: 'seller' | 'buyer' | null = kindRaw === 'seller' || kindRaw === 'buyer' ? kindRaw : null

  const name = cleanStr((raw as any).name, 200)
  const emailRaw = cleanStr((raw as any).email, 254)?.toLowerCase() || null
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : null
  const phone = cleanStr((raw as any).phone, 40)

  const extraction: ChatLeadExtraction = {
    kind,
    name,
    email,
    phone,
    business_name: cleanStr((raw as any).business_name, 200),
    industry: cleanStr((raw as any).industry, 120),
    location: cleanStr((raw as any).location, 200),
    revenue_range: cleanStr((raw as any).revenue_range, 100),
    reason_for_selling: cleanStr((raw as any).reason_for_selling, 500),
    timeframe: cleanStr((raw as any).timeframe, 100),
    asking_price: cleanStr((raw as any).asking_price, 100),
    budget_range: cleanStr((raw as any).budget_range, 100),
    industries_interest: cleanStr((raw as any).industries_interest, 200),
    preferred_location: cleanStr((raw as any).preferred_location, 200),
    ready: false,
  }

  // Minimum bar: kind known, name + valid email present. Sellers ideally also
  // have business_name, but we don't block the lead on that — a broker can
  // follow up for it; withholding a contactable lead is worse than an
  // incomplete one.
  extraction.ready = Boolean(extraction.kind && extraction.name && extraction.email)

  return extraction
}

export { EMAIL_RE }
