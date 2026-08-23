import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { listTemplates, saveTemplate, deleteTemplate, sendTemplate, seedTemplates } from '@/lib/emailTemplates'

export const runtime = 'nodejs'

/**
 * GET  /api/email-templates?agencyId=...&category=
 * POST /api/email-templates { action:'seed' } | { name, category, subject, body, variables? }
 * PATCH /api/email-templates { id, ... }
 * DELETE /api/email-templates { id }
 * POST /api/email-templates/send { id, to, vars }
 */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const agencyId = req.nextUrl.searchParams.get('agencyId') || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  const templates = await listTemplates(agencyId, req.nextUrl.searchParams.get('category') || undefined)
  return NextResponse.json({ ok: true, templates })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId) return NextResponse.json({ ok: false, error: 'No agency membership' }, { status: 403 })

  // Seed the standard library.
  if (body.action === 'seed') {
    const result = await seedTemplates(agencyId)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
    return NextResponse.json({ ok: true, seeded: result.seeded })
  }

  if (!body.name || !body.subject || !body.body) {
    return NextResponse.json({ ok: false, error: 'name, subject, and body are required' }, { status: 400 })
  }
  const result = await saveTemplate({
    agency_id: agencyId,
    id: body.id || null,
    name: body.name,
    category: body.category || 'general',
    subject: body.subject,
    body: body.body,
    variables: body.variables || [],
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, template: result.template })
}

export async function PATCH(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  const { data: tpl } = await db.from('email_templates').select('agency_id').eq('id', body.id).maybeSingle()
  if (!tpl) return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 })
  if (tpl.agency_id !== (body.agencyId || auth.memberships[0]?.agency_id)) {
    return NextResponse.json({ ok: false, error: 'Insufficient permission' }, { status: 403 })
  }
  const result = await saveTemplate({
    agency_id: tpl.agency_id,
    id: body.id,
    name: body.name,
    category: body.category,
    subject: body.subject,
    body: body.body,
    variables: body.variables,
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, template: result.template })
}

export async function DELETE(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  const result = await deleteTemplate(body.id)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
