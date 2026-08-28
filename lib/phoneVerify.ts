/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/phoneVerify.ts — SMS OTP verification for seller identity (Trust layer).
// Uses Twilio (keys in env). Codes are stored ONLY as salted hashes in the
// phone_verifications table (service-role only, no client policies), so a DB
// leak never exposes usable codes. Timing-safe compare on confirm.
// =============================================================================

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export const OTP_TTL_MS = 10 * 60 * 1000 // 10 minutes
export const OTP_MAX_ATTEMPTS = 5
export const OTP_LENGTH = 6

const SALT = process.env.VAPID_PRIVATE_KEY || 'concord-otp-salt'

/** Normalize a phone number to E.164-ish (digits only, + prefix). */
export function normalizePhone(input: string): string | null {
  const digits = String(input || '').replace(/[^\d+]/g, '')
  if (!digits) return null
  // US/CA: strip leading 1 for 10-digit numbers
  const cleaned = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (!/^\d{10,15}$/.test(cleaned)) return null
  return `+${cleaned}`
}

export function generateOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')
}

export function hashOtp(phone: string, code: string): string {
  return createHash('sha256').update(`${SALT}|${phone}|${code}`).digest('hex')
}

export function otpMatches(phone: string, code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(phone, code), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

/** Send an SMS via Twilio (Messaging Service preferred, else from number). */
export async function sendOtpSms(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  const fromNumber = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !authToken || (!messagingSid && !fromNumber)) {
    return { ok: false, error: 'SMS is not configured' }
  }
  try {
    const params = new URLSearchParams({
      To: phone,
      Body: `Your Concord verification code is ${code}. It expires in 10 minutes.`,
    })
    if (messagingSid) params.set('MessagingServiceSid', messagingSid)
    else params.set('From', fromNumber as string)
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `Twilio ${res.status}: ${body.slice(0, 120)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'SMS send failed' }
  }
}
