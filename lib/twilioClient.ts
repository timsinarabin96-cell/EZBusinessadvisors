// =============================================================================
// Twilio helper — outbound calls (David calls back) + SMS alerts.
// Uses the old account's API key (works for REST + Voice + SMS).
// =============================================================================

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const API_KEY_SID = process.env.TWILIO_API_KEY_SID || ''
const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET || ''
const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+17177167730'
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || ''

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${API_KEY_SID}:${API_KEY_SECRET}`).toString('base64')
}

/** Initiate an outbound call from our number → target. TwiML URL = our David webhook. */
export async function initiateDavidCall(to: string, context?: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) return { ok: false, error: 'Twilio not configured' }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Calls.json`
  const twimlUrl = `https://concord-deal-platform.vercel.app/api/voice/twilio${context ? `?context=${encodeURIComponent(context)}` : ''}`
  const body = new URLSearchParams({
    To: to,
    From: FROM_NUMBER,
    Url: twimlUrl,
    Method: 'POST',
    StatusCallback: 'https://concord-deal-platform.vercel.app/api/voice/events',
    StatusCallbackEvent: 'initiated ringing answered completed',
    StatusCallbackMethod: 'POST',
  })
  try {
    const res = await fetch(base, { method: 'POST', headers: { Authorization: authHeader() }, body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.message || `Twilio error ${res.status}` }
    return { ok: true, sid: data.sid }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Call failed' }
  }
}

/** Send an SMS alert (e.g., to the broker when David books/captures a lead). */
export async function sendSms(to: string, bodyText: string): Promise<{ ok: boolean; error?: string }> {
  if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) return { ok: false, error: 'Twilio not configured' }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`
  // Prefer the A2P-compliant messaging service; fall back to the direct number.
  const body = MESSAGING_SERVICE_SID
    ? new URLSearchParams({ To: to, MessagingServiceSid: MESSAGING_SERVICE_SID, Body: bodyText.slice(0, 1600) })
    : new URLSearchParams({ To: to, From: FROM_NUMBER, Body: bodyText.slice(0, 1600) })
  try {
    const res = await fetch(base, { method: 'POST', headers: { Authorization: authHeader() }, body })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data.message || `Twilio error ${res.status}` }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'SMS failed' }
  }
}
