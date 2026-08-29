/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Store work order dispatcher — fully hands-off supplier fulfillment.
// -----------------------------------------------------------------------------
// When a marketing-materials order is paid, this sends a WORK ORDER email to
// the supplier configured in store_settings.supplier_email (owner sets it once
// — e.g. their GotPrint / 4over / local print shop inbox). The email contains
// the order reference, product, quantity, print specs, and the ship-to address.
// The owner never touches the order; the supplier ships directly to the broker.
// =============================================================================

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export interface WorkOrderInput {
  orderId: string
  workOrderRef: string
  productName: string
  quantity: number
  unitCost: number
  supplier?: string | null
  printFileUrl?: string | null
  shipping: { name: string; line1: string; line2?: string; city: string; state: string; zip: string }
  customerEmail?: string
}

// Supplier routing — the owner picks these once; work orders auto-route.
// Paper products → 4over (trade wholesale). Apparel/promo → Printify (POD API).
// GotPrint is the small-run backup. Order emails are per-supplier.
export const SUPPLIER_ORDER_EMAILS: Record<string, string> = {
  '4over': 'cs@4over.com',
  'Printify': 'support@printify.com',
  'GotPrint': 'orders@gotprint.com',
}

export const SUPPLIER_PORTALS: Record<string, string> = {
  '4over': 'https://www.4over.com',
  'Printify': 'https://printify.com',
  'GotPrint': 'https://www.gotprint.com',
}

/** Render the supplier-facing work order email (branded, print-spec style). */
export function renderWorkOrderHtml(input: WorkOrderInput): string {
  const { productName, quantity, unitCost, shipping, workOrderRef, supplier, printFileUrl } = input
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const shipLine = [shipping.line1, shipping.line2, `${shipping.city}, ${shipping.state} ${shipping.zip}`].filter(Boolean).map(esc).join('<br/>')
  const supplierLine = supplier
    ? `<tr><td style="padding:6px 0;color:#888;width:40%">Supplier</td><td style="padding:6px 0;font-weight:700">${esc(supplier)}${SUPPLIER_PORTALS[supplier] ? ` — <a href="${esc(SUPPLIER_PORTALS[supplier])}" style="color:#c9a84c">portal</a>` : ''}</td></tr>`
    : ''

  return (
    `<div style="max-width:620px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif">` +
    `<div style="background:#1a1a2e;border-radius:10px;padding:20px 24px;color:#fff">` +
    `<div style="font-family:Georgia,serif;font-size:22px;font-weight:700;letter-spacing:0.02em">CONCORD Deal Platform</div>` +
    `<div style="font-size:12px;color:#c9a84c;text-transform:uppercase;letter-spacing:0.14em;margin-top:4px">Marketing Materials — Work Order</div>` +
    `</div>` +
    `<div style="background:#fbfaf7;border:1px solid #e5e0d3;border-radius:10px;padding:20px 24px;margin-top:14px">` +
    `<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em">Work Order Reference</div>` +
    `<div style="font-size:20px;font-weight:800;color:#1a1a2e;font-family:Georgia,serif;margin:4px 0 16px">${esc(workOrderRef)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#2a2a2a">` +
    `<tr><td style="padding:6px 0;color:#888;width:40%">Product</td><td style="padding:6px 0;font-weight:700">${esc(productName)}</td></tr>` +
    supplierLine +
    `<tr><td style="padding:6px 0;color:#888">Quantity</td><td style="padding:6px 0;font-weight:700">${quantity}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#888">Unit price</td><td style="padding:6px 0;font-weight:700">${money(unitCost)}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#888">Total</td><td style="padding:6px 0;font-weight:700">${money(unitCost * quantity)}</td></tr>` +
    `</table>` +
    `<div style="border-top:1px solid #e5e0d3;margin:14px 0"></div>` +
    (printFileUrl
      ? `<div style="background:#eef7f1;border:1px solid #d5eade;border-radius:8px;padding:12px 14px;margin-bottom:14px">` +
        `<div style="font-size:12px;color:#1e7e34;font-weight:700">📎 Print-ready artwork is attached — download and print:</div>` +
        `<a href="${esc(printFileUrl)}" style="display:inline-block;margin-top:6px;background:#16a34a;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700">Download print-ready PDF</a>` +
        `</div>`
      : '') +
    `<div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px">Ship To</div>` +
    `<div style="font-size:14px;color:#2a2a2a;line-height:1.6">${shipLine}</div>` +
    `</div>` +
    `<p style="font-size:12px;color:#b0b0bd;text-align:center;margin-top:18px">CONCORD Deal Platform · Automated work order · Do not reply to this email</p>` +
    `</div>`
  )
}

/**
 * Dispatch the work order to the right supplier. Routing priority:
 *   1. product-level supplier (4over / Printify / GotPrint) → its order email
 *   2. store_settings.supplier_email (manual override)
 *   3. owner email fallback (nothing is ever lost silently)
 * Returns { ok, supplier }.
 */
export async function dispatchStoreWorkOrder(input: WorkOrderInput): Promise<{ ok: boolean; supplier: string | null }> {
  let configuredEmail: string | null = null
  try {
    if (SUPABASE_URL && SERVICE_KEY) {
      const svc = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
      const { data } = await svc.from('store_settings').select('value').eq('key', 'supplier_email').maybeSingle()
      if (data?.value) configuredEmail = String(data.value)
    }
  } catch { /* settings lookup is best-effort */ }

  const supplierName = input.supplier || null
  const to =
    (supplierName && SUPPLIER_ORDER_EMAILS[supplierName]) ||
    configuredEmail ||
    process.env.STORE_OWNER_EMAIL ||
    'rtimsina@ezbusinessadvisors.com'
  const html = renderWorkOrderHtml(input)

  const res = await sendEmail({
    to,
    subject: `WORK ORDER ${input.workOrderRef} — ${input.productName} × ${input.quantity}${supplierName ? ` (${supplierName})` : ''}`,
    html,
    kind: 'generic',
    meta: { store_work_order: true, order_id: input.orderId, work_order_ref: input.workOrderRef, supplier: supplierName },
  })
  return { ok: res.ok, supplier: supplierName }
}
