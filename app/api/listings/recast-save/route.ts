/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { DOCS_BUCKET } from '@/lib/storageBuckets'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const runtime = 'nodejs'

const NAVY = rgb(0.102, 0.102, 0.18)
const GOLD = rgb(0.788, 0.659, 0.298)
const INK = rgb(0.16, 0.16, 0.24)
const MUTED = rgb(0.48, 0.5, 0.56)

/**
 * POST /api/listings/recast-save
 * Generates a branded recast summary PDF for the current running year and
 * saves it to the deal's financial folder (financial_docs bucket) + records it
 * in listing_recasts. This is the "live agent" recast deliverable — the broker
 * uploads financials, answers add-back questions, and this route closes the
 * loop with a saved document they can preview/download.
 *
 * Body: {
 *   listingId, businessName,
 *   year,                       // fiscal year being recast (defaults to current)
 *   revenue, sde, ebitda,       // recast (post add-back) numbers
 *   baseSde, baseEbitda,        // as-extracted before add-backs
 *   addBacks: [{ label, amount }],
 *   totalAddBacks
 * }
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const listingId = String(body?.listingId || '')
  const businessName = String(body?.businessName || 'Business')
  if (!listingId) return NextResponse.json({ ok: false, error: 'listingId required' }, { status: 400 })

  const year = Number(body?.year) || new Date().getFullYear()
  const money = (n: unknown) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
  const addBacks: Array<{ label: string; amount: number }> = Array.isArray(body?.addBacks) ? body.addBacks : []
  const totalAddBacks = Number(body?.totalAddBacks) || addBacks.reduce((s, a) => s + (Number(a.amount) || 0), 0)

  // ── Build the recast PDF ────────────────────────────────────────────────
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  // Header
  page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: NAVY })
  page.drawText('CONCORD Deal Platform', { x: 40, y: 748, size: 20, font: bold, color: GOLD })
  page.drawText('Recast Financial Summary', { x: 40, y: 722, size: 13, font: regular, color: rgb(1, 1, 1) })
  page.drawText(`Fiscal year ${year}`, { x: 40, y: 704, size: 11, font: regular, color: rgb(0.85, 0.85, 0.9) })

  // Business
  page.drawText(businessName, { x: 40, y: 668, size: 18, font: bold, color: NAVY })
  page.drawRectangle({ x: 40, y: 650, width: 64, height: 4, color: GOLD })

  let y = 610
  const row = (label: string, value: string, emphasis = false) => {
    page.drawText(label, { x: 40, y, size: 12, font: regular, color: MUTED })
    page.drawText(value, { x: 360, y, size: emphasis ? 14 : 12, font: emphasis ? bold : regular, color: emphasis ? NAVY : INK })
    y -= 24
  }

  row('Annual revenue (recast)', money(body?.revenue), true)
  row('Seller\'s discretionary earnings (SDE)', money(body?.sde), true)
  row('EBITDA', money(body?.ebitda), true)
  y -= 8

  // Add-backs
  page.drawText('Add-backs applied', { x: 40, y: y, size: 13, font: bold, color: NAVY })
  y -= 20
  if (addBacks.length === 0) {
    page.drawText('None recorded.', { x: 40, y, size: 11, font: regular, color: MUTED })
    y -= 20
  } else {
    for (const ab of addBacks) {
      if (!(Number(ab.amount) > 0)) continue
      page.drawText(String(ab.label).slice(0, 50), { x: 40, y, size: 11, font: regular, color: INK })
      page.drawText(money(ab.amount), { x: 360, y, size: 11, font: regular, color: INK })
      y -= 18
    }
  }
  y -= 6
  page.drawText(`Total add-backs: ${money(totalAddBacks)}`, { x: 40, y, size: 12, font: bold, color: GOLD })
  y -= 30

  // Before / after
  page.drawRectangle({ x: 40, y: y - 92, width: 532, height: 100, color: rgb(0.97, 0.95, 0.9) })
  page.drawText('BEFORE vs AFTER', { x: 56, y: y - 6, size: 10, font: bold, color: GOLD })
  page.drawText('As extracted SDE:  ' + money(body?.baseSde), { x: 56, y: y - 30, size: 12, font: regular, color: INK })
  page.drawText('Recast SDE:        ' + money(body?.sde), { x: 56, y: y - 52, size: 14, font: bold, color: NAVY })
  page.drawText('Recast EBITDA:     ' + money(body?.ebitda), { x: 56, y: y - 74, size: 12, font: bold, color: NAVY })
  y -= 120

  // Footer
  page.drawText('Prepared confidentially. Add-backs are owner-verified broker adjustments. © ' + new Date().getFullYear() + ' CONCORD Deal Platform', { x: 40, y: 30, size: 9, font: regular, color: MUTED })

  const pdf = await doc.save()

  // ── Save to the financial folder + record in listing_recasts ───────────
  const fileName = `recast-${year}.pdf`
  const storagePath = `${listingId}/${fileName}`
  // Generated recast deliverable → PUBLIC documents bucket (directly openable).
  const { error: upErr } = await db.storage.from(DOCS_BUCKET).upload(storagePath, new Uint8Array(pdf), {
    cacheControl: '3600',
    upsert: true,
    contentType: 'application/pdf',
  })
  if (upErr) return NextResponse.json({ ok: false, error: `storage: ${upErr.message}` }, { status: 500 })
  const { data: urlData } = db.storage.from(DOCS_BUCKET).getPublicUrl(storagePath)

  const recastPayload = {
    listing_id: listingId,
    original_sde: Number(body?.baseSde) || null,
    recasted_sde: Number(body?.sde) || null,
    original_ebitda: Number(body?.baseEbitda) || null,
    recasted_ebitda: Number(body?.ebitda) || null,
    add_backs: addBacks,
    adjustments: [{ label: 'Recast document', amount: 0, url: urlData?.publicUrl || null, year }],
    recasted_by: auth.user.id,
    recasted_at: new Date().toISOString(),
    notes: `Recast for FY${year} — revenue ${money(body?.revenue)}, total add-backs ${money(totalAddBacks)}`,
  }

  // Upsert one recast row per listing (idempotent re-saves keep the latest).
  const { data: existing } = await db.from('listing_recasts').select('id').eq('listing_id', listingId).order('recasted_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.id) {
    await db.from('listing_recasts').update(recastPayload).eq('id', existing.id)
  } else {
    await db.from('listing_recasts').insert(recastPayload)
  }

  return NextResponse.json({ ok: true, url: urlData?.publicUrl || null, fileName, year })
}
