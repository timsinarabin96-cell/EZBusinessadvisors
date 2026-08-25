import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { encryptSecret, decryptSecret } from '@/lib/vaultCrypto'

export const runtime = 'nodejs'

/**
 * /api/vault — per-user saved passwords (encrypted at rest).
 *   GET    → list of the caller's vault entries (passwords decrypted server-side)
 *   POST   → create { title, url?, username?, password, notes? }
 *   PATCH  → update { id, title?, url?, username?, password?, notes? }
 *   DELETE → delete { id }
 * Owner-only via RLS + explicit profile_id scoping on every query.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const { data, error } = await db
    .from('password_vault')
    .select('id, title, url, username, encrypted_password, notes, created_at, updated_at')
    .eq('profile_id', auth.profile.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const entries = await Promise.all(
    (data || []).map(async (row) => {
      let password = ''
      try { password = await decryptSecret(row.encrypted_password) } catch { /* keep blank on tamper */ }
      return {
        id: row.id,
        title: row.title,
        url: row.url,
        username: row.username,
        password,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    }),
  )

  return NextResponse.json({ ok: true, entries })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!title || !password) {
    return NextResponse.json({ ok: false, error: 'title and password are required' }, { status: 400 })
  }

  const encrypted = await encryptSecret(password)

  const { data, error } = await db
    .from('password_vault')
    .insert({
      profile_id: auth.profile.id,
      title,
      url: typeof body.url === 'string' ? body.url.trim() || null : null,
      username: typeof body.username === 'string' ? body.username.trim() || null : null,
      encrypted_password: encrypted,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    })
    .select('id, title, url, username, notes, created_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (typeof body.url === 'string') patch.url = body.url.trim() || null
  if (typeof body.username === 'string') patch.username = body.username.trim() || null
  if (typeof body.notes === 'string') patch.notes = body.notes.trim() || null
  if (typeof body.password === 'string' && body.password) patch.encrypted_password = await encryptSecret(body.password)
  patch.updated_at = new Date().toISOString()

  const { data, error } = await db
    .from('password_vault')
    .update(patch)
    .eq('id', body.id)
    .eq('profile_id', auth.profile.id)
    .select('id, title, url, username, notes, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (typeof body.id !== 'string' || !body.id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  }

  const { error } = await db
    .from('password_vault')
    .delete()
    .eq('id', body.id)
    .eq('profile_id', auth.profile.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
