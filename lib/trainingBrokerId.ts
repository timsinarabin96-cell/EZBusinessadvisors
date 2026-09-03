/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/trainingBrokerId.ts — single source of truth for the training broker id.
// Real id = signed-in user's profile id (UUID). Falls back to a local-storage
// stub ONLY for the anonymous demo view so it renders without auth wiring —
// never used for DB queries when signed in (the stub is not a valid UUID, so
// signed-in flows must never hit the DB with it).
// =============================================================================

'use client'

export async function getBrokerId(): Promise<string> {
  if (typeof window === 'undefined') return ''
  try {
    const { supabase } = await import('@/lib/supabase/client')
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) return user.id
  } catch {
    /* anonymous / offline — fall through to demo stub */
  }
  const stored = window.localStorage.getItem('concord_broker_id')
  if (stored) return stored
  const id = 'broker-' + Math.random().toString(36).slice(2, 10)
  window.localStorage.setItem('concord_broker_id', id)
  return id
}


