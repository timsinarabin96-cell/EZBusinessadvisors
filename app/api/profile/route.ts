import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 32 * 1024

// ---------------------------------------------------------------------------
// GET/PATCH /api/profile — the current user's own profile.
// Full details: full_name, phone, bio, title, license fields, socials.
// Photo upload goes through storage + update_profile_avatar (client lib).
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, role, status, avatar_url, avatar_thumb_url, license_type, license_state, license_country, license_number, license_expiry, license_verified, verified_buyer, created_at')
    .eq('id', auth.user.id)
    .maybeSingle()

  const { data: broker } = await db
    .from('broker_profiles')
    .select('id, public_name, title, bio, phone, email_public, linkedin, is_public')
    .eq('profile_id', auth.user.id)
    .maybeSingle()

  const { data: members } = await db
    .from('agency_members')
    .select('agency_id, role, is_owner')
    .eq('profile_id', auth.user.id)

  return NextResponse.json({ ok: true, profile, broker, memberships: members || [] })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const raw = await req.text().catch(() => '')
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Invalid or oversized body' }, { status: 400 })
  }
  let body: any = {}
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const profilePatch: Record<string, unknown> = {}
  const brokerPatch: Record<string, unknown> = {}

  // Profile fields (own profile only).
  if (body.full_name !== undefined) profilePatch.full_name = String(body.full_name).trim().slice(0, 120) || null
  if (body.license_type !== undefined) profilePatch.license_type = String(body.license_type).trim().slice(0, 60) || null
  if (body.license_state !== undefined) profilePatch.license_state = String(body.license_state).trim().slice(0, 40) || null
  if (body.license_country !== undefined) profilePatch.license_country = String(body.license_country).trim().slice(0, 40) || null
  if (body.license_number !== undefined) profilePatch.license_number = String(body.license_number).trim().slice(0, 60) || null
  if (body.license_expiry !== undefined) profilePatch.license_expiry = body.license_expiry || null

  if (Object.keys(profilePatch).length) {
    const { error } = await db.from('profiles').update(profilePatch).eq('id', auth.user.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Broker profile fields (create if missing).
  if (body.bio !== undefined || body.phone !== undefined || body.title !== undefined || body.linkedin !== undefined || body.public_name !== undefined) {
    if (body.bio !== undefined) brokerPatch.bio = String(body.bio).trim().slice(0, 2000) || null
    if (body.phone !== undefined) brokerPatch.phone = String(body.phone).trim().slice(0, 40) || null
    if (body.title !== undefined) brokerPatch.title = String(body.title).trim().slice(0, 120) || null
    if (body.linkedin !== undefined) brokerPatch.linkedin = String(body.linkedin).trim().slice(0, 200) || null
    if (body.public_name !== undefined) brokerPatch.public_name = String(body.public_name).trim().slice(0, 120) || null

    const { data: existing } = await db.from('broker_profiles').select('id').eq('profile_id', auth.user.id).maybeSingle()
    if (existing) {
      const { error } = await db.from('broker_profiles').update(brokerPatch).eq('profile_id', auth.user.id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    } else {
      const { error } = await db.from('broker_profiles').insert({
        profile_id: auth.user.id,
        agency_id: auth.memberships[0]?.agency_id || null,
        ...brokerPatch,
        is_public: false,
      })
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
