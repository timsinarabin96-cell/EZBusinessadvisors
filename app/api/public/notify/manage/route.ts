import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * /api/public/notify/manage — self-service alert management (public, no auth).
 *   GET    ?email=...          → list subscriptions for that email
 *   DELETE { id, email }       → unsubscribe (email must match the row)
 * Email-scoped via service role: a caller can only see/delete rows whose
 * email equals the one they provide. Never exposes other subscribers.
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const email = (req.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('deal_notify_subscriptions')
    .select('id, name, criteria, active, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, email, subscriptions: data || [] })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase()
  if (!id || !email) {
    return NextResponse.json({ ok: false, error: 'id and email are required' }, { status: 400 })
  }

  // Email must match the row — no one can unsubscribe someone else's alert.
  const { data: existing, error: findErr } = await db
    .from('deal_notify_subscriptions')
    .select('id')
    .eq('id', id)
    .eq('email', email)
    .maybeSingle()
  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ ok: false, error: 'Subscription not found for this email' }, { status: 404 })

  const { error } = await db.from('deal_notify_subscriptions').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
