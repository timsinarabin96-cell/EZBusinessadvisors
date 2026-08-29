/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Server-side Client Portal API.
// The token in the URL is the client's authorization (they have no Supabase
// session), so these read/write with the SERVICE ROLE. This module runs only
// on the server — the service key never reaches the browser.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('dealId') || ''
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!dealId || !token) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!SVC) return NextResponse.json({ ok: false, error: 'portal not configured' }, { status: 503 })

  // Validate token → get client name + authorization
  const { data: access, error: aErr } = await SVC.from('client_portal_access')
    .select('*').eq('deal_id', dealId).eq('token', token).eq('status', 'active').maybeSingle()
  if (aErr || !access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })

  const [dealRes, docsRes, milsRes, msgsRes] = await Promise.all([
    SVC.from('deals').select('*').eq('id', dealId).single(),
    SVC.from('deal_documents').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
    SVC.from('due_diligence_items').select('title, due_date, status').eq('deal_id', dealId),
    SVC.from('portal_messages').select('*').eq('deal_id', dealId).order('created_at', { ascending: true }),
  ])

  // Merge the deal's data-room files (linked through the listing) into the
  // document list so buyers open them from the portal — opens get logged to
  // data_room_view_logs → buyer intent. Dedup by file_url, room files win.
  let documents = docsRes.data || []
  const listingIdForRoom = dealRes.data?.listing_id
  if (listingIdForRoom) {
    const { data: rooms } = await SVC.from('data_rooms').select('id').eq('listing_id', listingIdForRoom).eq('status', 'active')
    const roomIds = (rooms || []).map((r: { id: string }) => r.id)
    if (roomIds.length > 0) {
      const { data: roomFiles } = await SVC
        .from('data_room_files')
        .select('id, file_name, file_url, file_kind, storage_path')
        .in('data_room_id', roomIds)
        .eq('is_deleted', false)
      const seen = new Set<string>()
      const merged: any[] = []
      for (const f of roomFiles || []) {
        merged.push({ id: f.id, file_name: f.file_name || 'Document', file_url: f.file_url, storage_path: f.storage_path, category: f.file_kind || 'Data Room' })
        if (f.file_url) seen.add(f.file_url)
      }
      for (const d of documents) {
        if (d.file_url && seen.has(d.file_url)) continue
        merged.push(d)
      }
      documents = merged
    }
  }

  // Seller traction: anonymized listing views + NDA interest (when the deal
  // links to a listing). Counts only — never buyer identities.
  let traction: { viewsTotal: number; views7d: number; ndaSigned: number; interestedBuyers: number } | null = null
  const listingId = dealRes.data?.listing_id
  if (listingId) {
    const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString()
    const [viewsRes, ndaRes] = await Promise.all([
      SVC.from('listing_views').select('visitor_id, viewed_at').eq('listing_id', listingId).limit(5000),
      SVC.from('nda_requests').select('id, status').eq('listing_id', listingId),
    ])
    const views = viewsRes.data || []
    const visitors = new Set<string>()
    let views7d = 0
    for (const v of views) {
      visitors.add(v.visitor_id)
      if (v.viewed_at >= cutoff7) views7d += 1
    }
    const ndaList = ndaRes.data || []
    traction = {
      viewsTotal: views.length,
      views7d,
      ndaSigned: ndaList.filter((n) => n.status === 'signed').length,
      interestedBuyers: ndaList.filter((n) => n.status === 'signed' || n.status === 'approved').length,
    }
  }

  // SECURITY: private-bucket files are served as short-lived signed URLs.
  // Never hand a permanent public URL to client financial documents.
  documents = await Promise.all((documents || []).map(async (d: any) => {
    const path = d.file_path || d.storage_path || null
    if (!path) return d
    for (const bucket of ['financial_docs', 'documents']) {
      const { data: su } = await SVC.storage.from(bucket).createSignedUrl(path, 3600)
      if (su?.signedUrl) return { ...d, file_url: su.signedUrl }
    }
    return d
  }))

  const milestones = (milsRes.data || []).map((m) => ({
    title: m.title, date: m.due_date ? String(m.due_date) : undefined, status: m.status,
  }))
  // Deal progress summary for the client — what % of the process is done.
  const done = milestones.filter((m) => ['approved', 'waived', 'completed'].includes(m.status || '')).length
  const pending = milestones.filter((m) => ['pending', 'in_review'].includes(m.status || '')).length
  const progress = {
    percent: milestones.length ? Math.round((done / milestones.length) * 100) : 0,
    done,
    pending,
    total: milestones.length,
  }

  return NextResponse.json({
    ok: true,
    clientName: access.client_name,
    clientEmail: access.client_email || null,
    deal: dealRes.data || null,
    documents,
    milestones,
    progress,
    messages: msgsRes.data || [],
    traction,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dealId, token, action } = body
  if (!dealId || !token || !action) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!SVC) return NextResponse.json({ ok: false, error: 'portal not configured' }, { status: 503 })

  const { data: access, error: aErr } = await SVC.from('client_portal_access')
    .select('*').eq('deal_id', dealId).eq('token', token).eq('status', 'active').maybeSingle()
  if (aErr || !access) return NextResponse.json({ ok: false, error: 'invalid or revoked link' }, { status: 404 })

  if (action === 'message') {
    const { body: msgText, clientName } = body
    if (!msgText || !String(msgText).trim()) return NextResponse.json({ ok: false, error: 'empty message' }, { status: 400 })
    const { data, error } = await SVC.from('portal_messages').insert({
      deal_id: dealId, author: 'client', author_name: clientName || access.client_name, body: String(msgText).trim(),
    }).select().single()
    if (error) return NextResponse.json({ ok: false, error: 'message failed' }, { status: 500 })
    return NextResponse.json({ ok: true, message: data })
  }

  if (action === 'upload') {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    const kind = String(form?.get('kind') || 'Client Upload')
    if (!file || !(file instanceof File)) return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 })
    // SECURITY: hard caps on upload size (25 MB) and file type — prevents
    // storage abuse, malware uploads, and HTML/script payloads served from
    // our domain. PDFs, Office docs, and images only.
    const MAX_BYTES = 25 * 1024 * 1024
    const ALLOWED_TYPES = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'text/plain',
    ])
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File too large (max 25 MB).' }, { status: 413 })
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ ok: false, error: 'File type not allowed.' }, { status: 415 })
    try {
      const clean = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      // SECURITY: upload to the PRIVATE financial_docs bucket — never the
      // public 'documents' bucket. Files are served via short-lived signed
      // URLs generated at read time (see GET below).
      const path = `portal/${dealId}/${Date.now()}-${clean}`
      const { error: upErr } = await SVC.storage.from('financial_docs').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
      })
      if (upErr) return NextResponse.json({ ok: false, error: 'upload failed' }, { status: 500 })
      const { error: insErr } = await SVC.from('deal_documents').insert({
        deal_id: dealId, file_name: file.name, file_path: path, file_url: '', category: kind,
      })
      if (insErr) return NextResponse.json({ ok: false, error: 'record failed' }, { status: 500 })
      return NextResponse.json({ ok: true })
    } catch {
      return NextResponse.json({ ok: false, error: 'upload error' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
