import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// DELETE /api/admin/agencies/[id] — permanently remove a junk/test agency.
// Platform admin only. Deletes dependent rows (RESTRICT FKs: listings, buyer
// leads, seller leads, deals) first, then the agency (everything else cascades).
// Refuses to delete the caller's own agency or the last remaining agency.
// =============================================================================

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }

  const { id: agencyId } = await params
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agency id required' }, { status: 400 })

  const { data: agency } = await db.from('agencies').select('id, name').eq('id', agencyId).maybeSingle()
  if (!agency) return NextResponse.json({ ok: false, error: 'Agency not found' }, { status: 404 })

  // Guard: caller's own agency (avoid locking yourself out).
  const { data: { user } } = await db.auth.getUser()
  if (user) {
    const { data: member } = await db.from('agency_members').select('is_owner').eq('agency_id', agencyId).eq('profile_id', user.id).maybeSingle()
    if (member?.is_owner) {
      return NextResponse.json({ ok: false, error: 'Cannot delete your own agency' }, { status: 400 })
    }
  }

  // Guard: never delete the last agency.
  const { count } = await db.from('agencies').select('id', { count: 'exact', head: true })
  if ((count || 0) <= 1) {
    return NextResponse.json({ ok: false, error: 'Cannot delete the last agency' }, { status: 400 })
  }

  // RESTRICT FKs must be cleared first (their children cascade onward).
  await db.from('seller_leads').delete().eq('agency_id', agencyId)
  await db.from('deals').delete().eq('agency_id', agencyId)
  await db.from('buyer_leads').delete().eq('agency_id', agencyId)
  await db.from('listings').delete().eq('agency_id', agencyId)

  // Everything else (members, usage, settings, docs, etc.) cascades.
  const { error } = await db.from('agencies').delete().eq('id', agencyId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const actor = await resolveAdminActor(req)
  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'delete_agency', targetType: 'agency', targetId: agencyId, targetLabel: agency.name,
    details: { listings_deleted: true, deals_deleted: true, leads_deleted: true },
  })

  return NextResponse.json({ ok: true, deleted: { id: agencyId, name: agency.name } })
}
