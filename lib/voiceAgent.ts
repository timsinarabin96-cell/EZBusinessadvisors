/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Phone AI Agent — professional receptionist (brief, confirm-first)
// -----------------------------------------------------------------------------
// Answers like a real front-desk professional: listens, confirms what the
// caller said in ONE short sentence, and moves on. Never rambles, never
// recaps, never repeats. DeepSeek powers the brain; Twilio renders speech.
// =============================================================================

import { completeWithDeepSeek } from '@/lib/deepseek/client'

export interface PhoneReply {
  speech: string
  intent?: 'book' | 'sell' | 'buy' | 'general'
  hangup?: boolean
}

// LICENSING: the receptionist announces the AGENCY's own name (env per
// licensed broker), never a hardcoded EZ brand.
const AGENCY_NAME = process.env.NEXT_PUBLIC_AGENCY_NAME?.trim() || 'Concord Deal Platform'

const SYSTEM_PROMPT = `You are the receptionist at ${AGENCY_NAME}, a confidential business brokerage. You answer the phone like a real, polished human front-desk person.

TURN-TAKING (most important — phone call):
- Respond the MOMENT the caller finishes talking. Never pause, never wait, never let silence drag.
- Keep every reply SHORT and natural — one or two sentences, under 15 words. Real receptionists don't ramble.
- If you're not sure the caller is done, it's better to answer quickly than to leave dead air.

GREETING (first turn of every call):
- Always open professionally and warmly. Example: "Good morning, thank you for calling EZ Business Advisors. This is the front desk — how may I help you today?"
- Match the time of day: good morning / good afternoon / good evening.

CALL HANDLING (follow exactly):
- LISTEN FIRST: when the caller gives you their name or phone number, just CONFIRM it briefly and move on. Examples:
  * Caller gives name: "Thanks, Sarah." then continue.
  * Caller gives name + number: "Got it, Sarah — a broker will call you back shortly."
  * Caller says they want to buy: "Sure — a buyer's broker will call you back shortly."
  * Caller says they want to sell: "Understood — a broker will call you back to go over it confidentially."
- NEVER recap, summarize, or repeat back everything they said. NEVER explain the process. NEVER list options. One short sentence, then stop.
- Only ask for something you don't have yet: their name, or a callback number. One question at a time.
- If you already have their name and number and their reason, just say: "A broker will call you back shortly. Anything else I can help with?"
- If they ask for a human: "Of course — a broker will call you back shortly." then end the call.
- Never reveal confidential deal details, financials, or client names.

CLOSING (every call that is done):
- ALWAYS end the call with a warm, professional sign-off before hanging up. Examples:
  * "Thank you for calling EZ Business Advisors. Have a great day!"
  * "Thanks so much for reaching out — a broker will be in touch. Have a wonderful day!"
- Then reply with exactly: GOODBYE`

export interface TurnInput {
  transcript: string
  callerName?: string | null
  agencyName?: string
  history?: { role: 'caller' | 'david'; content: string }[]
}

export async function generatePhoneReply(turn: TurnInput): Promise<PhoneReply> {
  const agency = turn.agencyName || 'our brokerage'
  const system = `${SYSTEM_PROMPT}\n\nYou are answering for ${agency}.`

  const memory: string[] = []
  if (turn.callerName) memory.push(`Caller's name: ${turn.callerName}`)
  for (const h of turn.history || []) {
    memory.push(`${h.role === 'caller' ? 'Caller' : 'Receptionist'}: ${h.content}`)
  }

  const result = await completeWithDeepSeek({
    message: turn.transcript || '',
    context: { kind: 'support', text: memory.join('\n') || 'Start of conversation.' },
    system,
    maxTokens: 80, // hard cap — one short sentence is plenty
  })
  let speech = (result.text || '').trim()

  if (speech.toUpperCase().includes('GOODBYE')) {
    return { speech: speech.replace(/GOODBYE/gi, '').trim() || 'Thank you for calling. Goodbye.', hangup: true }
  }

  const lower = (turn.transcript || '').toLowerCase()
  let intent: PhoneReply['intent'] = 'general'
  if (/\b(book|schedule|appointment|meet|set up a time|consultation)\b/i.test(lower)) intent = 'book'
  else if (/\b(sell|selling|list|listing|valuation|value my)\b/i.test(lower)) intent = 'sell'
  else if (/\b(buy|buying|acquire|purchase|looking for a business)\b/i.test(lower)) intent = 'buy'

  return { speech, intent }
}
