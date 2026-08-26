import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/expenses — platform cost center (admin only).
//   GET  ?month=YYYY-MM — all expenses (platform + every tenant)
//   POST — create an expense (platform-level: agency_id null)
// =============================================================================

const CATEGORIES = ['ai_api', 'hosting', 'domain', 'sms_phone', 'email', 'tools', 'marketing', 'subscriptions', 'other']

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const month = req.nextUrl.searchParams.get('month') || undefined
  let q = db.from('expenses').select('*, agencies(name)').order('expense_date', { ascending: false }).limit(2000)
  if (month) q = q.gte('expense_date', `${month}-01`)
  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, expenses: data || [] })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const category = String(body.category || '')
  const vendor = String(body.vendor || '').trim()
  const amountCents = Math.round(Number(body.amount_cents))
  if (!CATEGORIES.includes(category)) return NextResponse.json({ ok: false, error: 'Invalid category' }, { status: 400 })
  if (!vendor) return NextResponse.json({ ok: false, error: 'Vendor is required' }, { status: 400 })
  if (!amountCents || amountCents <= 0) return NextResponse.json({ ok: false, error: 'Amount must be positive' }, { status: 400 })

  const { data: row, error } = await db
    .from('expenses')
    .insert({
      category,
      vendor,
      description: body.description ? String(body.description).slice(0, 300) : null,
      amount_cents: amountCents,
      currency: String(body.currency || 'USD').toUpperCase().slice(0, 3),
      expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
      recurring: !!body.recurring,
      paid: body.paid !== false,
      payment_method: body.payment_method ? String(body.payment_method).slice(0, 60) : null,
      payment_reference: body.payment_reference ? String(body.payment_reference).slice(0, 120) : null,
      receipt_url: body.receipt_url ? String(body.receipt_url).slice(0, 500) : null,
      notes: body.notes ? String(body.notes).slice(0, 1000) : null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const actor = await resolveAdminActor(req)
  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'expense_create', targetType: 'expense', targetId: String(row.id), targetLabel: `${vendor} — $${(amountCents / 100).toFixed(2)}`,
    details: { category, amountCents, expense_date: row.expense_date },
  })

  return NextResponse.json({ ok: true, expense: row }, { status: 201 })
}
