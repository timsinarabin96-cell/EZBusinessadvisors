/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/documents/templates/save — persist an AI-inferred (or hand-built)
 * template to the agency's library.
 * body: { name, category?, description?, fields[], parties[], body_template,
 *         agencyId?, sourceFileName? }
 * Scoped: only members of the target agency may save; agency_id is stamped so
 * the template appears ONLY in that agency's library (white-label ready).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const fields = Array.isArray(body.fields) ? body.fields : []
  const parties = Array.isArray(body.parties) ? body.parties : []
  const bodyTemplate = String(body.body_template || '').trim()

  if (!name) return NextResponse.json({ ok: false, error: 'name is required' }, { status: 400 })
  if (!fields.length) return NextResponse.json({ ok: false, error: 'At least one field is required' }, { status: 400 })
  if (!bodyTemplate) return NextResponse.json({ ok: false, error: 'body_template is required' }, { status: 400 })

  const agencyId = String(body.agencyId || '').trim() || auth.memberships[0]?.agency_id || null
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency context — join an agency first' }, { status: 400 })
  const memberOfAgency = auth.memberships.some((m) => m.agency_id === agencyId)
  if (!memberOfAgency) return NextResponse.json({ ok: false, error: 'Not a member of this agency' }, { status: 403 })

  const { data, error } = await db
    .from('document_templates')
    .insert({
      name: name.slice(0, 200),
      description: body.description ? String(body.description).slice(0, 400) : null,
      category: body.category ? String(body.category).slice(0, 60) : 'Other',
      fields,
      parties,
      body_template: bodyTemplate,
      is_active: true,
      agency_id: agencyId,
      created_by: auth.user.id,
      source_filename: body.sourceFileName ? String(body.sourceFileName).slice(0, 255) : null,
      ai_extracted: body.aiExtracted === true,
    })
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to save template' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, template: data })
}
