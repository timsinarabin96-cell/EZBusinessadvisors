/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { notify } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =============================================================================
// /api/portal/invite — send the branded invite email for a granted portal
// access row, record role + expiry on the data-room shares/buyers tables, and
// (with revoke:true) mark the buyer revoked + audit-logged.
// -----------------------------------------------------------------------------
// Broker-side only (session-authenticated). The client link itself is created
// by grantClientAccess() (client-side); this route is the server half that
// emails the invite and persists role/expiry where RLS doesn't allow.
// =============================================================================

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dealId, accessId, clientName, clientEmail, role, expiryDays, portalUrl, revoke } = body

  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  // Same agency-membership gate as the data-room API.
  const { data: deal } = await db.from('deals').select('id, agency_id, title').eq('id', dealId).maybeSingle()
  const dealAgency = (deal as { agency_id?: string | null } | null)?.agency_id
  if (!dealAgency) return NextResponse.json({ ok: false, error: 'Deal not found' }, { status: 404 })
  if (!authenticated.memberships.some((m) => m.agency_id === dealAgency)) {
    return NextResponse.json({ ok: false, error: 'Not a member of this deal\'s agency' }, { status: 403 })
  }

  const dealTitle = (deal as { title?: string | null } | null)?.title || null

  if (revoke) {
    // Revoke: mark the data-room buyer revoked + audit-log it.
    if (clientEmail) {
      const { data: rooms } = await db.from('data_rooms').select('id').eq('deal_id', dealId).eq('status', 'active')
      for (const room of rooms || []) {
        await db
          .from('data_room_buyers')
          .update({ status: 'revoked' })
          .eq('data_room_id', room.id)
          .eq('buyer_email', String(clientEmail).toLowerCase())
        await db.from('data_room_activities').insert({
          data_room_id: room.id,
          action: 'revoked',
          details: `Access revoked for ${clientEmail}`,
          user_email: authenticated.user.email || authenticated.user.id,
        })
      }
    }
    return NextResponse.json({ ok: true, revoked: true })
  }

  if (!accessId || !clientEmail || !portalUrl) {
    return NextResponse.json({ ok: false, error: 'accessId, clientEmail, and portalUrl are required' }, { status: 400 })
  }

  const roomRole = ['viewer', 'uploader', 'editor', 'commenter'].includes(role) ? role : 'viewer'
  const expiresAt = expiryDays && Number(expiryDays) > 0
    ? new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString()
    : null

  // Persist role + expiry on the data-room shares/buyers rows (server-side).
  const { data: rooms } = await db.from('data_rooms').select('id, name').eq('deal_id', dealId).eq('status', 'active')
  for (const room of rooms || []) {
    await db.from('data_room_shares').insert({
      data_room_id: room.id,
      shared_by: authenticated.user.id,
      share_type: 'email',
      shared_with: String(clientEmail).toLowerCase(),
      role: roomRole,
      permissions: { role: roomRole, expiryDays: expiryDays ? Number(expiryDays) : null },
      message: 'Invited via data room access panel',
      expires_at: expiresAt,
      status: 'pending',
    }).select('id')
    await db.from('data_room_buyers').insert({
      data_room_id: room.id,
      buyer_email: String(clientEmail).toLowerCase(),
      buyer_name: clientName || null,
      role: roomRole,
      invited_by: authenticated.user.id,
      status: 'invited',
    }).select('id')
    await db.from('data_room_activities').insert({
      data_room_id: room.id,
      action: 'created',
      details: `Invited ${clientEmail} (${roomRole})${expiresAt ? ' — expires ' + expiresAt.slice(0, 10) : ''}`,
      user_email: authenticated.user.email || authenticated.user.id,
    })
  }

  // Branded invite email with the portal link.
  await notify('portal_invite', String(clientEmail), {
    clientName,
    portalUrl,
    dealTitle,
    expiresAt: expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null,
  })

  return NextResponse.json({ ok: true, role: roomRole, expiresAt })
}
