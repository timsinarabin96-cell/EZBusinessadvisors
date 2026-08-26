import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

/**
 * DELETE /api/listings/[id] — permanently remove a listing.
 * Server-side (service role) so delete works for agency admins AND owners,
 * and so we clean up: public_listings row (cascade), gallery images from
 * storage, and the listing row itself. Previously client-side only (RLS
 * limited deletes to the listing owner, and storage files were orphaned).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'listing id required' }, { status: 400 })

  // Load the listing to verify agency access + grab gallery for storage cleanup.
  const { data: listing } = await db.from('listings').select('id, agency_id, agent_id, image_urls, gallery_json').eq('id', id).maybeSingle()
  if (!listing) return NextResponse.json({ ok: false, error: 'Listing not found' }, { status: 404 })

  const canDelete = canManageAgency(auth, listing.agency_id) || listing.agent_id === auth.user.id
  if (!canDelete) return forbiddenResponse()

  // Clean up gallery images from storage (best-effort).
  const urls: string[] = []
  if (Array.isArray(listing.image_urls)) urls.push(...listing.image_urls)
  if (Array.isArray(listing.gallery_json)) {
    for (const g of listing.gallery_json as unknown[]) {
      if (g && typeof g === 'object' && 'url' in (g as Record<string, unknown>)) {
        urls.push(String((g as Record<string, unknown>).url))
      }
    }
  }
  for (const u of urls) {
    const path = u.split('/object/public/')[1]
    if (path) await db.storage.from('listings').remove([path]).catch(() => {})
  }

  // Delete the listing (public_listings cascades; other FKs cascade or set null).
  const { error } = await db.from('listings').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
