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

const SYSTEM_PROMPT = `You are the receptionist at EZ Business Advisors, a confidential business brokerage. You answer the phone like a real, polished human front-desk person.

HARD RULES (phone call — follow exactly):
- Reply in AT MOST ONE short sentence. Under 15 words. Ever.
- LISTEN FIRST: when the caller gives you their name or phone number, just CONFIRM it briefly and move on. Examples:
  * Caller gives name: "Thanks, Sarah." then continue.
  * Caller gives name + number: "Got it, Sarah — a broker will call you back shortly."
  * Caller says they want to buy: "Sure — a buyer's broker will call you back shortly."
  * Caller says they want to sell: "Understood — a broker will call you back to go over it confidentially."
- NEVER recap, summarize, or repeat back everything they said. NEVER explain the process. NEVER list options. One sentence, then stop.
- Only ask for something you don't have yet: their name, or a callback number. One question at a time.
- If you already have their name and number and their reason, just say: "A broker will call you back shortly. Anything else I can help with?"
- If they ask for a human: "Of course — a broker will call you back shortly." then end the call.
- Never reveal confidential deal details, financials, or client names.
- If the call is done, reply with exactly: GOODBYE`

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
