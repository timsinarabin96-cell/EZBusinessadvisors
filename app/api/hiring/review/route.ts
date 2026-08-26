/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const reviewSchema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(['reviewing', 'interview', 'approved', 'rejected']),
  notes: z.string().max(1000).optional(),
})

/**
 * POST /api/hiring/review — broker/admin reviews an application.
 * (Moved out of app/api/hiring/route.ts where the pathname check never fired.)
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const parsed = reviewSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { applicationId, action, notes } = parsed.data
  const { data: app } = await db.from('agent_applications').select('id').eq('id', applicationId).maybeSingle()
  if (!app) return NextResponse.json({ ok: false, error: 'Application not found' }, { status: 404 })
  const { error } = await db.from('agent_applications').update({
    status: action,
    reviewed_by: authenticated.user.id,
    reviewed_at: new Date().toISOString(),
    notes: notes || null,
  }).eq('id', applicationId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: action })
}
