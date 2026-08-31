/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Document delivery — approval-gated send path for CIM / BOV / recast.
// -----------------------------------------------------------------------------
// A delivery is created in `pending_approval`. Nothing leaves the platform
// until the broker single-taps Approve (which triggers the real send: PDF
// upload → email with attachment → Deal Room placement → share link) or Reject.
// Server-only orchestration over the doc_deliveries table (agency RLS).
// =============================================================================

import { createServerClient } from '@/lib/supabase/server'
import type { Listing } from '@/lib/listings'
import { generateCimContent, type CimContent } from '@/lib/cim'
import { generateBovContent, bovDocumentTitle, bovLabelFromTitle, latestBovReviewState, type BovContent, type BovReviewState } from '@/lib/bov'
import { recastFinancials, attachRecastAnalysis, assertRecastConsistency, type RecastInput, type RecastResult } from '@/lib/recast'
import { exportCimToPdf, exportBovToPdf, exportRecastToPdf } from '@/lib/pdfExport'
import { sendEmail } from '@/lib/email'
import { DOCS_BUCKET } from '@/lib/storageBuckets'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'

export type DocKind = 'cim' | 'bov' | 'recast' | 'bli'
export type DeliveryStatus = 'pending_approval' | 'approved' | 'rejected' | 'sent' | 'failed'

export interface DeliveryRow {
  id: string
  agency_id: string
  listing_id: string | null
  deal_id: string | null
  doc_kind: DocKind
  doc_title: string | null
  version_id: string | null
  generated_doc_id: string | null
  storage_path: string | null
  recipient_name: string | null
  recipient_email: string
  recipient_role: 'buyer' | 'seller' | 'other'
  status: DeliveryStatus
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  reject_reason: string | null
  share_token: string | null
  share_url: string | null
  email_status: string | null
  deal_room_file_id: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface CreateDeliveryInput {
  agencyId: string
  listingId: string
  dealId?: string | null
  docKind: DocKind
  recipientName?: string | null
  recipientEmail: string
  recipientRole?: 'buyer' | 'seller' | 'other'
  /** Optional pre-generated content; when omitted the deliverable is generated on approval. */
  recast?: RecastResult | null
}

const rand = (): string => {
  const b = new Uint8Array(24)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Create — always lands in pending_approval. Never sends.
// ---------------------------------------------------------------------------
export async function createDelivery(input: CreateDeliveryInput): Promise<{ ok: boolean; delivery?: DeliveryRow; error?: string }> {
  const db = createServerClient()
  if (!db) return { ok: false, error: 'not configured' }
  const { data: listing } = await db.from('listings').select('id, business_name, agency_id').eq('id', input.listingId).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }
  if (listing.agency_id !== input.agencyId) return { ok: false, error: 'Cross-agency delivery is not allowed' }

  const title =
    input.docKind === 'cim' ? `${listing.business_name || 'Business'} — Confidential Information Memorandum`
    : input.docKind === 'bov' ? bovDocumentTitle(listing.business_name, await latestBovReviewState(db, input.listingId))
    : input.docKind === 'recast' ? `${listing.business_name || 'Business'} — Recast Report`
    : `${listing.business_name || 'Business'} — Business Listing Information`

  const { data, error } = await db.from('doc_deliveries').insert({
    agency_id: input.agencyId,
    listing_id: input.listingId,
    deal_id: input.dealId ?? null,
    doc_kind: input.docKind,
    doc_title: title,
    recipient_name: input.recipientName ?? null,
    recipient_email: input.recipientEmail.trim().toLowerCase(),
    recipient_role: input.recipientRole ?? 'buyer',
    status: 'pending_approval',
    requested_by: null,
    share_token: rand(),
  }).select().maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, delivery: data as DeliveryRow }
}

// ---------------------------------------------------------------------------
// Queue + history
// ---------------------------------------------------------------------------
export async function listDeliveries(agencyId: string, status?: DeliveryStatus): Promise<DeliveryRow[]> {
  const db = createServerClient()
  if (!db) return []
  let q = db.from('doc_deliveries').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(200)
  if (status) q = q.eq('status', status)
  const { data } = await q
  return (data as DeliveryRow[]) || []
}

// ---------------------------------------------------------------------------
// Generate the PDF bytes for a delivery (server-side, branded).
// ---------------------------------------------------------------------------
async function resolveAgencyBranding(agencyId: string) {
  try {
    const { resolveAgencyBranding } = await import('@/lib/agencyBranding')
    const brand = await resolveAgencyBranding(agencyId)
    if (brand.agencyId) {
      return { name: brand.displayName, displayName: brand.displayName, phone: brand.phone, email: brand.email }
    }
  } catch { /* fall back to generic footer */ }
  return null
}

async function loadFontAssets() {
  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = process.cwd()
    const b64 = (rel: string) => fs.readFileSync(path.join(root, 'public', rel)).toString('base64')
    return {
      fonts: {
        '/fonts/PlayfairDisplay_700Bold.ttf': b64('fonts/PlayfairDisplay_700Bold.ttf'),
        '/fonts/PlayfairDisplay_400Regular.ttf': b64('fonts/PlayfairDisplay_400Regular.ttf'),
        '/fonts/Inter_400Regular.ttf': b64('fonts/Inter_400Regular.ttf'),
        '/fonts/Inter_700Bold.ttf': b64('fonts/Inter_700Bold.ttf'),
      },
      images: {
        '/brand/claw-cover.jpg': b64('brand/claw-cover.jpg'),
        '/brand/claw-data.jpg': b64('brand/claw-data.jpg'),
      },
    }
  } catch {
    return undefined
  }
}

export async function generateDeliveryPdf(
  listing: Listing,
  docKind: DocKind,
  recast?: RecastResult | null,
): Promise<{ ok: boolean; bytes?: Uint8Array; error?: string }> {
  try {
    const agencyId = (listing as { agency_id?: string | null }).agency_id || null
    const agency = agencyId ? await resolveAgencyBranding(agencyId) : null
    const assets = await loadFontAssets()
    const opts = { returnBytes: true as const, agency, assets }

    if (docKind === 'recast') {
      let result = recast
      if (!result) {
        const input: RecastInput = {
          listingId: listing.id,
          businessName: listing.business_name || 'Business',
          entityType: 'llc',
          currency: '$',
          years: [],
          addBacks: [],
        }
        result = recastFinancials(input)
      }
      // GATE 1 (boss 08-31): hard-validate the invariant before ANY PDF is
      // produced — even when the recast was loaded from a stored project, so
      // a stale/drifted result can never be sent to a buyer.
      assertRecastConsistency(result)
      const bytes = await exportRecastToPdf(attachRecastAnalysis(result), opts)
      if (!bytes) return { ok: false, error: 'Recast PDF generation failed' }
      return { ok: true, bytes }
    }

    if (docKind === 'cim') {
      const band = bandForIndustry(listing.industry, listing.ebitda ? 'EBITDA' : 'SDE')
      const content: CimContent = generateCimContent(listing, { recast, marketBand: band })
      const bytes = await exportCimToPdf(content, opts)
      if (!bytes) return { ok: false, error: 'CIM PDF generation failed' }
      return { ok: true, bytes }
    }

    if (docKind === 'bov') {
      const db = createServerClient()
      const content: BovContent = generateBovContent(listing, { recast, reviewState: db ? await latestBovReviewState(db, listing.id) : 'draft' })
      const bytes = await exportBovToPdf(content, opts)
      if (!bytes) return { ok: false, error: 'BOV PDF generation failed' }
      return { ok: true, bytes }
    }

    return { ok: false, error: `Unsupported doc kind: ${docKind}` }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'PDF generation failed' }
  }
}

// ---------------------------------------------------------------------------
// Approve — THE single tap. Generates the PDF, uploads it, emails the
// recipient with an attachment + secure share link, drops a copy in the Deal
// Room, and flips the delivery to `sent`.
// ---------------------------------------------------------------------------
export async function approveDelivery(deliveryId: string, approverId: string): Promise<{ ok: boolean; delivery?: DeliveryRow; error?: string }> {
  const db = createServerClient()
  if (!db) return { ok: false, error: 'not configured' }

  const { data: delivery } = await db.from('doc_deliveries').select('*').eq('id', deliveryId).maybeSingle()
  if (!delivery) return { ok: false, error: 'Delivery not found' }
  if (delivery.status !== 'pending_approval') return { ok: false, error: `Delivery is already ${delivery.status}` }

  const { data: listing } = await db.from('listings').select('*').eq('id', delivery.listing_id).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found' }

  try {
    // 1) PDF bytes (recast analysis carried in when available from the listing's recast project)
    let recastResult: RecastResult | null = null
    try {
      const { data: project } = await db.from('recast_projects').select('result_json').eq('listing_id', delivery.listing_id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (project?.result_json) recastResult = project.result_json as RecastResult
    } catch { /* recast optional */ }
    // GATE 1 (boss 08-31): a stored recast that fails the invariant must NOT
    // be sendable — validate before upload/email/Deal Room, not after.
    if (recastResult) assertRecastConsistency(recastResult)

    const gen = await generateDeliveryPdf(listing as Listing, delivery.doc_kind, recastResult)
    if (!gen.ok || !gen.bytes) return { ok: false, error: gen.error || 'PDF generation failed' }

    // 2) Upload to the public documents bucket
    const safeName = (delivery.doc_title || 'deliverable').replace(/[^a-z0-9]+/gi, '_').slice(0, 80)
    const storagePath = `deliveries/${delivery.agency_id}/${delivery.id}-${safeName}.pdf`
    const { error: upErr } = await db.storage.from(DOCS_BUCKET).upload(storagePath, Buffer.from(gen.bytes), {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (upErr) return { ok: false, error: `Storage upload failed: ${upErr.message}` }

    // 3) Secure share link (token already on the row)
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://ezbusinessadvisors.vercel.app'
    const shareUrl = `${base}/share/doc/${delivery.share_token}`
    const { data: signed } = await db.storage.from(DOCS_BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 30)
    const directUrl = signed?.signedUrl || null

    // 4) Email the recipient with an attachment + link
    let emailStatus = 'skipped'
    try {
      const res = await sendEmail({
        to: delivery.recipient_email,
        subject: `Confidential: ${delivery.doc_title || 'Deliverable'} — ${listing.business_name || ''}`,
        kind: 'deliverable',
        html: buildDeliveryEmailHtml(delivery, listing, shareUrl),
        meta: { deliveryId, docKind: delivery.doc_kind, listingId: delivery.listing_id },
        attachments: [{ filename: `${safeName}.pdf`, content: Buffer.from(gen.bytes).toString('base64'), contentType: 'application/pdf' }],
      })
      emailStatus = res.ok ? (res.queued ? 'queued' : 'ok') : 'failed'
    } catch { emailStatus = 'failed' }

    // 5) Deal Room placement (best-effort; requires a data room for the deal/listing)
    let dealRoomFileId: string | null = null
    try {
      const { addFileToDealRoom } = await import('@/lib/dataRoomDelivery')
      dealRoomFileId = await addFileToDealRoom({
        agencyId: delivery.agency_id,
        listingId: delivery.listing_id,
        dealId: delivery.deal_id,
        fileName: `${safeName}.pdf`,
        storagePath,
        uploaderName: 'Advisor',
        uploaderRole: 'admin',
      })
    } catch { /* deal room optional */ }

    // 6) Mark sent
    const { data: updated } = await db.from('doc_deliveries').update({
      status: 'sent',
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      storage_path: storagePath,
      share_url: shareUrl,
      email_status: emailStatus,
      deal_room_file_id: dealRoomFileId,
      updated_at: new Date().toISOString(),
    }).eq('id', deliveryId).select().maybeSingle()

    return { ok: true, delivery: (updated as DeliveryRow) || null }
  } catch (e: any) {
    // Mark failed so the queue shows it needs attention
    await db.from('doc_deliveries').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', deliveryId)
    return { ok: false, error: e?.message || 'Send failed' }
  }
}

// ---------------------------------------------------------------------------
// Reject — single tap, no send, reason recorded.
// ---------------------------------------------------------------------------
export async function rejectDelivery(deliveryId: string, reason?: string): Promise<{ ok: boolean; delivery?: DeliveryRow; error?: string }> {
  const db = createServerClient()
  if (!db) return { ok: false, error: 'not configured' }
  const { data } = await db.from('doc_deliveries').update({
    status: 'rejected',
    reject_reason: reason?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', deliveryId).select().maybeSingle()
  if (!data) return { ok: false, error: 'Delivery not found' }
  return { ok: true, delivery: data as DeliveryRow }
}

// ---------------------------------------------------------------------------
// HTML email template — premium, client-facing.
// ---------------------------------------------------------------------------
function buildDeliveryEmailHtml(delivery: DeliveryRow, listing: any, shareUrl: string): string {
  const kindLabel = { cim: 'Confidential Information Memorandum', bov: bovLabelFromTitle(delivery.doc_title), recast: 'Recast / Normalized Earnings Report', bli: 'Business Listing Information' }[delivery.doc_kind] || 'Deliverable'
  const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
  return `
  <div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#1a1a2e">
    <div style="background:#0B0C10;color:#C9A84C;padding:28px 32px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase">Confidential — Under NDA</div>
      <div style="font-size:24px;font-weight:700;margin-top:6px">${esc(delivery.doc_title || kindLabel)}</div>
    </div>
    <div style="border:1px solid #e5e0d0;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px">
      <p style="font-size:15px;line-height:1.7">Dear ${esc(delivery.recipient_name || 'Prospective Buyer')},</p>
      <p style="font-size:15px;line-height:1.7">Please find attached the ${kindLabel} for <strong>${esc(listing.business_name || 'the subject business')}</strong>, prepared by ${esc((listing as any).agency_name || 'our advisory team')}.</p>
      <p style="font-size:15px;line-height:1.7">A secure private copy is available here: <a href="${esc(shareUrl)}" style="color:#C9A84C;font-weight:700">${esc(shareUrl)}</a></p>
      <p style="font-size:13px;color:#666;line-height:1.6">This document is confidential and provided solely for evaluating a potential transaction. Please do not distribute it. If you have questions, we are glad to walk you through the analysis.</p>
      <p style="font-size:15px;margin-top:24px">Sincerely,<br/>${esc((listing as any).agency_name || 'Your Advisory Team')}</p>
    </div>
  </div>`
}
