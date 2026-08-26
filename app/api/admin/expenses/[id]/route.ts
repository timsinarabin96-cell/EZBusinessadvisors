import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/platform'
import { recordAdminAudit, resolveAdminActor } from '@/lib/adminAudit'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/expenses/[id] — PATCH (edit) / DELETE (remove) a cost entry.
// =============================================================================

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (body.category) patch.category = String(body.category)
  if (body.vendor !== undefined) patch.vendor = String(body.vendor).trim()
  if (body.description !== undefined) patch.description = body.description ? String(body.description).slice(0, 300) : null
  if (body.amount_cents !== undefined) patch.amount_cents = Math.round(Number(body.amount_cents))
  if (body.expense_date) patch.expense_date = String(body.expense_date)
  if (body.recurring !== undefined) patch.recurring = !!body.recurring
  if (body.paid !== undefined) patch.paid = !!body.paid
  if (body.payment_method !== undefined) patch.payment_method = body.payment_method ? String(body.payment_method).slice(0, 60) : null
  if (body.payment_reference !== undefined) patch.payment_reference = body.payment_reference ? String(body.payment_reference).slice(0, 120) : null
  if (body.receipt_url !== undefined) patch.receipt_url = body.receipt_url ? String(body.receipt_url).slice(0, 500) : null
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).slice(0, 1000) : null

  const { error } = await db.from('expenses').update(patch).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { id } = await params
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const { data: expense } = await db.from('expenses').select('id, vendor, amount_cents').eq('id', id).maybeSingle()
  const { error } = await db.from('expenses').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const actor = await resolveAdminActor(req)
  await recordAdminAudit({
    actorId: actor.id, actorEmail: actor.email,
    action: 'expense_delete', targetType: 'expense', targetId: id,
    targetLabel: expense ? `${expense.vendor} — $${((expense.amount_cents || 0) / 100).toFixed(2)}` : id,
    details: {},
  })
  return NextResponse.json({ ok: true })
}
