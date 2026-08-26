/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Auth token helper — safely reads the current Supabase access token from
// localStorage regardless of which storage key layout the client uses.
// Supabase stores the session under `sb-<project-ref>-auth-token` (a JSON
// blob), NOT under the old `sb-access-token` key some pages still read —
// which is why those pages hit "Authentication required" on every API call.
// =============================================================================

/** Read the live access token from Supabase's real storage key (JSON blob). */
export function getStoredAccessToken(): string {
  try {
    if (typeof window === 'undefined') return ''
    // Supabase persists the session as sb-<ref>-auth-token → JSON with access_token.
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = window.localStorage.getItem(key)
        if (!raw) continue
        try {
          const parsed = JSON.parse(raw)
          if (parsed?.access_token) return parsed.access_token
        } catch {
          // Not JSON — maybe the raw token itself.
          if (raw.startsWith('eyJ')) return raw
        }
      }
    }
    // Legacy fallback.
    return window.localStorage.getItem('sb-access-token') || ''
  } catch {
    return ''
  }
}

/** Build an Authorization header for authed API calls. */
export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getStoredAccessToken()
  return { authorization: `Bearer ${token}`, ...extra }
}
