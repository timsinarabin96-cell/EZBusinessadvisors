/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { extractDocumentText } from '@/lib/ai/textExtract'
import { inferTemplateFromText } from '@/lib/ai/templateImport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/documents/templates/import — upload your ORIGINAL legal document
 * (PDF/Word/text/image) and AI converts it into a fillable template:
 *   multipart: file (required), agencyId? (defaults to caller's agency),
 *              name? (optional override)
 * Returns the inferred template (fields + parties + body_template with
 * {{placeholders}}) so the UI can review before saving. Nothing is written
 * until the broker confirms (POST /api/documents/templates/save).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 })
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'File too large (max 15MB)' }, { status: 400 })
  }

  const agencyId = String(form.get('agencyId') || '').trim() || auth.memberships[0]?.agency_id || null
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: 'No agency context — join an agency first' }, { status: 400 })
  }
  // Caller must belong to the target agency (any member may import their docs).
  const memberOfAgency = auth.memberships.some((m) => m.agency_id === agencyId)
  if (!memberOfAgency) return NextResponse.json({ ok: false, error: 'Not a member of this agency' }, { status: 403 })

  const buffer = Buffer.from(await file.arrayBuffer())

  // 1) Extract text (PDF via pdf-parse, text direct, images OCR'd server-side).
  const extracted = await extractDocumentText({ fileName: file.name, mime: file.type, data: buffer })
  if (!extracted.text.trim()) {
    return NextResponse.json({ ok: false, error: 'Could not read any text from this document (scanned image? try a text-layer PDF).' }, { status: 422 })
  }

  // 2) Agency name for the AI context.
  let agencyName: string | null = null
  const { data: agency } = await db.from('agencies').select('name').eq('id', agencyId).maybeSingle()
  if (agency?.name) agencyName = agency.name

  // 3) AI infers the fillable template.
  try {
    const inferred = await inferTemplateFromText({ fileName: file.name, text: extracted.text, agencyName })
    if (!inferred.fields.length) {
      return NextResponse.json({ ok: false, error: 'AI found no fillable fields in this document — try a cleaner copy.' }, { status: 422 })
    }
    return NextResponse.json({
      ok: true,
      inferred,
      source: { fileName: file.name, byteLength: file.size, truncated: extracted.truncated },
      agencyId,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'AI import failed' }, { status: 500 })
  }
}
