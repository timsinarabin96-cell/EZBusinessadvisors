/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SVC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SVC = SVC_URL && SVC_KEY ? createClient(SVC_URL, SVC_KEY, { auth: { persistSession: false } }) : null
const BUCKET = 'financial_docs'
const FILE_SECRET = process.env.FILE_SECRET || process.env.CRON_SECRET || ''

// =============================================================================
// /api/deal-files — "file this for me" helper (Deal Inbox, Option A).
// -----------------------------------------------------------------------------
// Lets a broker (session) OR Yavin/the agent (x-file-secret header) drop an
// emailed document straight into a deal's data room under an organized folder
// with full provenance metadata — the foundation of the email-to-deal pipeline.
//
//   POST /api/deal-files  (multipart)
//     file          → the attachment (PDF, DOCX, XLSX, image, …)
//     dealId        → target deal (or listingId / businessName)
//     listingId     → optional direct listing target
//     businessName  → optional fuzzy deal lookup by business name
//     sender        → original email sender
//     subject       → original email subject
//     source        → 'email' | 'telegram' | 'forward' | 'manual'
//     folderName    → folder to file under (default 'Email Attachments')
//     notes         → free-text note (stored on the file row)
//
// Auth: broker session (Authorization Bearer) OR x-file-secret header.
// Files are versioned (never overwrite), metadata lands in notes, and the
// activity feed records who filed what, from where.
// =============================================================================

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
  'text/plain', 'text/csv',
])
const MAX_BYTES = 50 * 1024 * 1024

function kindFromMime(mime: string, name: string): string {
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf'
  if (mime.includes('word') || /\.docx?$/i.test(name)) return 'word'
  if (mime.includes('excel') || /\.xlsx?$/i.test(name)) return 'excel'
  if (mime.includes('powerpoint') || /\.pptx?$/i.test(name)) return 'slides'
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('csv') || /\.csv$/i.test(name)) return 'csv'
  return 'other'
}

async function resolveActor(req: NextRequest) {
  // Agent / automation path: shared secret header.
  const secret = req.headers.get('x-file-secret') || ''
  if (FILE_SECRET && secret && secret === FILE_SECRET) {
    return { email: 'yavin@concord-deal-platform', userId: null, agent: true }
  }
  // Broker path: session.
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return null
  return { email: authenticated.user.email || authenticated.user.id, userId: authenticated.user.id, agent: false }
}

export async function POST(req: NextRequest) {
  if (!SVC) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const actor = await resolveActor(req)
  if (!actor) return unauthorizedResponse()

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ ok: false, error: 'multipart/form-data expected' }, { status: 400 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: 'File too large (max 50 MB).' }, { status: 413 })
  }
  if (!ALLOWED_TYPES.has(file.type) && !/\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|webp|gif|tiff|csv|txt)$/i.test(file.name)) {
    return NextResponse.json({ ok: false, error: 'File type not allowed.' }, { status: 415 })
  }

  const dealId = String(form.get('dealId') || '')
  const listingId = String(form.get('listingId') || '')
  const businessName = String(form.get('businessName') || '')
  const sender = String(form.get('sender') || '')
  const subject = String(form.get('subject') || '')
  const source = String(form.get('source') || 'email')
  const folderName = String(form.get('folderName') || 'Email Attachments')
  const notes = String(form.get('notes') || '')

  // --- Resolve the target deal / listing ------------------------------------
  let resolvedDealId = dealId
  let resolvedListingId = listingId
  let dealTitle = ''

  if (!resolvedDealId && !resolvedListingId && businessName) {
    const { data: listing } = await SVC
      .from('listings')
      .select('id, business_name')
      .ilike('business_name', `%${businessName}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (listing?.id) {
      resolvedListingId = listing.id
      dealTitle = listing.business_name || ''
      const { data: deal } = await SVC.from('deals').select('id').eq('listing_id', listing.id).limit(1).maybeSingle()
      if (deal?.id) resolvedDealId = deal.id
    }
  }
  if (resolvedDealId) {
    const { data: deal } = await SVC.from('deals').select('id, listing_id, title').eq('id', resolvedDealId).maybeSingle()
    if (deal) {
      dealTitle = deal.title || dealTitle
      if (!resolvedListingId && deal.listing_id) resolvedListingId = deal.listing_id
    }
  }
  if (!resolvedDealId && !resolvedListingId) {
    return NextResponse.json({ ok: false, error: 'dealId, listingId, or businessName required' }, { status: 400 })
  }
  if (!resolvedDealId && resolvedListingId) {
    const { data: deal } = await SVC.from('deals').select('id').eq('listing_id', resolvedListingId).limit(1).maybeSingle()
    if (deal?.id) resolvedDealId = deal.id
  }
  if (!resolvedDealId) {
    return NextResponse.json({ ok: false, error: 'Could not find a deal for this listing' }, { status: 404 })
  }

  // --- Ensure data room + target folder -------------------------------------
  let roomId: string | null = null
  const { data: byListing } = resolvedListingId
    ? await SVC.from('data_rooms').select('id').eq('listing_id', resolvedListingId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null }
  if (byListing?.id) roomId = byListing.id
  if (!roomId) {
    const { data: byDeal } = await SVC.from('data_rooms').select('id').eq('deal_id', resolvedDealId).eq('status', 'active').maybeSingle()
    if (byDeal?.id) roomId = byDeal.id
  }
  if (!roomId) {
    const { data: created, error } = await SVC
      .from('data_rooms')
      .insert({ deal_id: resolvedDealId, listing_id: resolvedListingId || null, name: dealTitle ? `${dealTitle} — Data Room` : 'Deal Data Room', status: 'active' })
      .select('id')
      .single()
    if (error || !created) return NextResponse.json({ ok: false, error: 'could not create data room' }, { status: 500 })
    roomId = created.id
  }

  let folderId: string | null = null
  if (folderName) {
    const { data: existing } = await SVC
      .from('data_room_folders')
      .select('id')
      .eq('data_room_id', roomId)
      .eq('name', folderName)
      .limit(1)
      .maybeSingle()
    if (existing?.id) folderId = existing.id
    else {
      const { data: created } = await SVC
        .from('data_room_folders')
        .insert({ data_room_id: roomId, name: folderName })
        .select('id')
        .single()
      if (created?.id) folderId = created.id
    }
  }

  // --- Upload + record (versioned; never overwrite) -------------------------
  const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `data-room/${roomId}/email/${Date.now()}-${clean}`
  const { error: upErr } = await SVC.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (upErr) return NextResponse.json({ ok: false, error: 'upload failed: ' + upErr.message }, { status: 500 })

  const url = SVC.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { data: row, error: insErr } = await SVC.from('data_room_files').insert({
    data_room_id: roomId,
    folder_id: folderId,
    file_name: file.name,
    file_url: url,
    storage_path: path,
    file_type: file.type || null,
    file_size: file.size,
    file_kind: kindFromMime(file.type || '', file.name),
    uploaded_by: actor.userId,
    version: 1,
    notes: JSON.stringify({
      sender: sender || null,
      subject: subject || null,
      source: source || 'email',
      filed_by: actor.email,
      filed_at: new Date().toISOString(),
      dealId: resolvedDealId,
      listingId: resolvedListingId || null,
      note: notes || null,
    }),
  }).select().single()
  if (insErr) return NextResponse.json({ ok: false, error: 'record failed: ' + insErr.message }, { status: 500 })

  await SVC.from('data_room_activities').insert({
    data_room_id: roomId,
    action: 'uploaded',
    details: `${file.name} filed via ${source}${subject ? ` (${subject})` : ''}${folderName ? ` → ${folderName}` : ''}`,
    user_email: actor.email,
  })

  return NextResponse.json({
    ok: true,
    file: { id: row.id, name: row.file_name, folder: folderName, dealId: resolvedDealId, listingId: resolvedListingId },
  })
}
