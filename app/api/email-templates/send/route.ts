import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { sendTemplate } from '@/lib/emailTemplates'

export const runtime = 'nodejs'

/** POST /api/email-templates/send { id, to, vars } — render + queue a template email. */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const auth = await authenticateProfileRequest(req)
  if (!auth) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  if (!body.id || !body.to) {
    return NextResponse.json({ ok: false, error: 'id and to are required' }, { status: 400 })
  }

  const { data: tpl } = await db
    .from('email_templates')
    .select('agency_id, subject, body')
    .eq('id', body.id)
    .maybeSingle()
  if (!tpl) return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 })
  const agencyId = body.agencyId || auth.memberships[0]?.agency_id
  if (!agencyId || tpl.agency_id !== agencyId) {
    return NextResponse.json({ ok: false, error: 'Insufficient permission' }, { status: 403 })
  }

  const result = await sendTemplate(tpl, body.to, body.vars || {})
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
