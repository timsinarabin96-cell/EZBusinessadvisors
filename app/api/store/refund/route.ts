/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { refundCheckoutSession } from '@/lib/stripeCheckout'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * POST /api/store/refund — owner/admin only.
 * Body: { orderId, reason? }
 * Refunds the buyer's Stripe payment, marks the order refunded, emails the
 * buyer a refund receipt, and emails the vendor a refund request so the owner
 * gets their wholesale money back too.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()
  if (!auth.memberships.some((m) => m.is_owner || m.role === 'admin')) {
    return forbiddenResponse('Owner access required to refund orders')
  }

  const body = await req.json().catch(() => ({}))
  const orderId = String(body?.orderId || '')
  const reason = String(body?.reason || 'Customer did not receive the product').trim()
  if (!orderId) return NextResponse.json({ ok: false, error: 'missing orderId' }, { status: 400 })

  const { data: order } = await db.from('store_orders').select('*').eq('id', orderId).maybeSingle()
  if (!order) return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 })
  if (order.refunded_at) return NextResponse.json({ ok: false, error: 'Order is already refunded' }, { status: 400 })
  if (!order.stripe_session_id) {
    return NextResponse.json({ ok: false, error: 'No Stripe session on this order — cannot refund' }, { status: 400 })
  }

  const amountCents = Math.round(Number(order.subtotal || 0) * 100)
  const refund = await refundCheckoutSession(order.stripe_session_id, {
    amountCents,
    reason: reason.slice(0, 200),
  })
  if (!refund.ok || !refund.refundId) {
    return NextResponse.json({ ok: false, error: refund.error || 'Refund failed' }, { status: 502 })
  }

  // Mark the order refunded.
  const now = new Date().toISOString()
  await db.from('store_orders').update({
    status: 'cancelled',
    refunded_at: now,
    refund_reason: reason,
    refund_amount: Number(order.subtotal || 0),
    refund_stripe_ref: refund.refundId,
  }).eq('id', orderId)

  // Buyer refund receipt (fire-and-forget).
  const buyerEmail = String(order.buyer_email || order.shipping_address?.name || '')
  if (buyerEmail.includes('@')) {
    sendEmail({
      to: buyerEmail,
      subject: `Refund issued — ${order.product_name} (${order.work_order_ref || 'order'})`,
      html:
        `<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
        `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
        `<div style="font-family:Georgia,serif;font-size:20px;font-weight:700">CONCORD Deal Platform</div>` +
        `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Refund Receipt</div></div>` +
        `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
        `<div style="font-size:20px;font-weight:800;color:#16a34a;font-family:Georgia,serif">✅ ${'$' + Number(order.subtotal || 0).toFixed(2)} refunded</div>` +
        `<div style="font-size:13px;color:#666;margin-top:6px">${order.product_name} × ${order.quantity}${order.work_order_ref ? ` · ${order.work_order_ref}` : ''}</div>` +
        `<div style="font-size:13px;color:#666;margin-top:4px">Reason: ${reason}</div>` +
        `<div style="font-size:12px;color:#999;margin-top:12px">Refunds typically appear on your statement within 5–10 business days.</div>` +
        `</div><p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">Questions? Contact customer service.</p></div>`,
      kind: 'generic',
      meta: { store_refund: true, order_id: orderId, refund_id: refund.refundId },
    }).catch(() => {})
  }

  // Vendor refund request (fire-and-forget) — owner recovers wholesale cost.
  try {
    const { dispatchVendorRefundRequest } = await import('@/lib/storeWorkOrder')
    await dispatchVendorRefundRequest({
      orderId,
      workOrderRef: order.work_order_ref || `WO-${orderId.slice(0, 6)}`,
      productName: order.product_name,
      quantity: Number(order.quantity || 1),
      unitCost: Number(order.unit_cost || 0),
      supplier: order.product?.supplier || null,
      refundReason: reason,
    })
  } catch { /* vendor request is best-effort */ }

  return NextResponse.json({ ok: true, refundId: refund.refundId })
}
