/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createServerClient } from '@/lib/supabase/server'
import { authenticateRequest } from '@/lib/supabase/auth'
import type { NextRequest } from 'next/server'

// =============================================================================
// Admin audit trail — every platform-admin action is recorded so the boss can
// see who did what, to whom, and when. Never throws: audit failures must not
// break the underlying admin action.
// =============================================================================

export interface AdminAuditEntry {
  actorId: string | null
  actorEmail: string | null
  action: string
  targetType: 'user' | 'agency' | 'listing' | 'subscription' | 'expense' | 'settings' | 'legal_vault'
  targetId?: string | null
  targetLabel?: string | null
  details?: Record<string, unknown>
}

/** Record an admin action (best-effort, never throws). */
export async function recordAdminAudit(entry: AdminAuditEntry): Promise<void> {
  try {
    const db = createServerClient()
    if (!db) return
    await db.from('admin_audit_log').insert({
      actor_id: entry.actorId || null,
      actor_email: entry.actorEmail || null,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId || null,
      target_label: entry.targetLabel || null,
      details: entry.details || {},
    })
  } catch {
    // Audit is best-effort — never fail the underlying action.
  }
}

/** Resolve the acting profile (id + email) from a request for audit purposes. */
export async function resolveAdminActor(req: Request): Promise<{ id: string | null; email: string | null }> {
  try {
    // The request carries the caller's Bearer JWT — resolve THAT user. The old
    // implementation called getUser() on a token-less service-role client,
    // which ALWAYS returned null (audit #5: entries were written with no
    // actor, making the trail useless as a security control).
    const auth = await authenticateRequest(req as NextRequest)
    if (!auth) return { id: null, email: null }
    return { id: auth.user.id, email: auth.user.email || null }
  } catch {
    return { id: null, email: null }
  }
}
