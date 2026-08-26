/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// emailVerification — pure helpers for the email-verification gate.
// Enforced everywhere: signup (must confirm before the dashboard unlocks),
// login (unconfirmed → blocked with a resend path), and server-side auth
// (API calls rejected until the email is confirmed).
// =============================================================================

import type { User } from '@supabase/supabase-js'

/** Is this user's email confirmed (Supabase auth)? */
export function isEmailConfirmed(user: Pick<User, 'email_confirmed_at'> | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at)
}

export type VerificationState = 'confirmed' | 'unconfirmed' | 'unknown'

/** Classify a user's verification state for the login/signup UI. */
export function verificationState(
  user: Pick<User, 'email_confirmed_at'> | null | undefined,
): VerificationState {
  if (!user) return 'unknown'
  return user.email_confirmed_at ? 'confirmed' : 'unconfirmed'
}

/** Minimum password policy — enforced at signup and reset. */
export const PASSWORD_POLICY = {
  minLength: 8,
  hint: 'At least 8 characters, with a letter and a number.',
} as const

/** Validate a password against the policy. Returns null when OK. */
export function passwordIssue(password: string): string | null {
  if (password.length < PASSWORD_POLICY.minLength) {
    return `Password must be at least ${PASSWORD_POLICY.minLength} characters.`
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.'
  }
  return null
}
