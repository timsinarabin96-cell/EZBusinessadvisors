// =============================================================================
// Phone AI Agent — conversation engine
// -----------------------------------------------------------------------------
// Drives the AI phone receptionist: answers calls, greets callers, understands
// intent (book appointment / sell a business / buy a business / general), and
// returns a spoken reply + optional booking action. DeepSeek powers the brain;
// the Twilio webhook renders the reply as TwiML speech.
// =============================================================================

import { completeWithDeepSeek } from '@/lib/deepseek/client'
import { extractBooking } from '@/lib/booking'

export type CallIntent = 'book' | 'sell' | 'buy' | 'general' | 'unknown'

export interface PhoneReply {
  /** What the AI says to the caller (plain speech text). */
  speech: string
  /** Detected intent, when confident. */
  intent?: CallIntent
  /** Structured booking result when the caller asked to book. */
  booking?: {
    needs_confirmation: boolean
    question?: string
    appointment?: Record<string, unknown>
    message?: string
  }
  /** Should the platform hang up (call completed). */
  hangup?: boolean
}

const SYSTEM_PROMPT = `You are CONCORD Reception, the friendly AI receptionist for a confidential business brokerage.

Your job on a phone call:
- Greet callers warmly and professionally. Keep replies SHORT (under 30 words per turn) — this is a phone call, not a chat.
- Ask for the caller's name and what they're calling about, one question at a time.
- Detect intent: are they calling to BOOK AN APPOINTMENT, SELL a business, BUY a business, or something else?
- For booking requests: confirm the caller wants to book, then ask for a preferred date and time. Say you're noting it down.
- For sell/buy: take a brief note of their business/industry and say a broker will follow up confidentially.
- Never reveal confidential deal details, financials, or client names.
- If the caller asks for a human, say "I'll make sure a broker calls you back shortly" — and end the call.
- If the call is done, reply with exactly: GOODBYE`

export interface TurnInput {
  transcript: string
  callerName?: string | null
  agencyName?: string
}

/**
 * Produce the next spoken reply for a call turn.
 * @param turn  The accumulated transcript (or last caller utterance) + context.
 * @returns    Spoken reply + structured actions.
 */
export async function generatePhoneReply(turn: TurnInput): Promise<PhoneReply> {
  const agency = turn.agencyName || 'our brokerage'
  const system = `${SYSTEM_PROMPT}\n\nYou are answering for ${agency}.`
  const lower = (turn.transcript || '').toLowerCase()

  const result = await completeWithDeepSeek({
    message: turn.transcript || '',
    context: { kind: 'support', text: `Caller name: ${turn.callerName || 'unknown'}` },
    system,
    maxTokens: 256,
  })
  let speech = (result.text || '').trim()

  // GOODBYE marker → hang up.
  if (speech.toUpperCase().includes('GOODBYE')) {
    return { speech: speech.replace(/GOODBYE/gi, '').trim() || 'Thank you for calling. Goodbye.', hangup: true }
  }

  // Booking intent: detect strongly worded booking requests and extract.
  const bookingHints = /\b(book|schedule|appointment|meet|call back|set up a time|consultation)\b/i
  const timeHints = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|at \d|am\b|pm\b)\b/i
  let intent: CallIntent = 'general'
  if (bookingHints.test(lower)) intent = 'book'
  else if (/\b(sell|selling|list|listing|value my|valuation)\b/i.test(lower)) intent = 'sell'
  else if (/\b(buy|buying|acquire|purchase|looking for a business)\b/i.test(lower)) intent = 'buy'

  // If booking intent + a time reference exists, attempt structured booking.
  let booking: PhoneReply['booking']
  if (intent === 'book' && timeHints.test(lower)) {
    try {
      const extraction = await extractBooking(`${turn.callerName || 'The caller'} ${turn.transcript}`)
      if (extraction.needs_confirmation || !extraction.data) {
        booking = { needs_confirmation: true, question: extraction.question || 'What day and time works best for you?' }
      } else {
        booking = {
          needs_confirmation: false,
          message: 'Appointment details captured for the broker to confirm.',
          appointment: extraction.data as unknown as Record<string, unknown>,
        }
        speech = `Perfect — I've noted ${extraction.data.title || 'your appointment'}. A broker will confirm shortly. Anything else I can help with?`
      }
    } catch {
      booking = { needs_confirmation: true, question: 'Could you repeat the date and time you had in mind?' }
    }
  } else if (intent === 'book') {
    booking = { needs_confirmation: true, question: 'What day and time works best for you?' }
  }

  return { speech, intent, booking }
}
