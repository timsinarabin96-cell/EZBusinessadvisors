/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * DELETE /api/appointments/[id] — remove an appointment.
 * Server-side (service role) so delete works for agency members, not just
 * admins (client-side RLS delete is admin-only). Mirrors the listings delete.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'appointment id required' }, { status: 400 })

  // Load the appointment to verify agency access.
  const { data: appointment } = await db.from('appointments').select('id, agency_id, assigned_to, created_by').eq('id', id).maybeSingle()
  if (!appointment) return NextResponse.json({ ok: false, error: 'Appointment not found' }, { status: 404 })

  const canDelete = canManageAgency(auth, appointment.agency_id) || appointment.assigned_to === auth.user.id || appointment.created_by === auth.user.id
  if (!canDelete) return forbiddenResponse()

  const { error } = await db.from('appointments').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
