import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { submitAgentApplication } from '@/lib/hiring'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 32 * 1024

const applicationSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional(),
  experience: z.string().max(2000).optional(),
  package_id: z.string().uuid().optional().nullable(),
})

const reviewSchema = z.object({
  applicationId: z.string().uuid(),
  action: z.enum(['reviewing', 'interview', 'approved', 'rejected']),
  notes: z.string().max(1000).optional(),
})

/**
 * POST /api/hiring/apply — public advisor application (picks a package).
 * POST /api/hiring/review — broker/admin reviews an application.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const url = new URL(req.url)

  if (url.pathname.endsWith('/review')) {
    const authenticated = await authenticateProfileRequest(req)
    if (!authenticated) return unauthorizedResponse()
    const parsed = reviewSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
    }
    const { applicationId, action, notes } = parsed.data
    const { data: app } = await db.from('agent_applications').select('id').eq('id', applicationId).maybeSingle()
    if (!app) return NextResponse.json({ ok: false, error: 'Application not found' }, { status: 404 })
    const { error } = await db.from('agent_applications').update({
      status: action,
      reviewed_by: authenticated.user.id,
      reviewed_at: new Date().toISOString(),
      notes: notes || null,
    }).eq('id', applicationId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: action })
  }

  // Public apply
  const raw = await req.text().catch(() => '')
  if (!raw) return NextResponse.json({ ok: false, error: 'Empty request body.' }, { status: 400 })
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Request too large.' }, { status: 413 })
  }
  const parsed = applicationSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const result = await submitAgentApplication(parsed.data)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, id: result.id })
}

/** GET /api/hiring/applications — broker/admin lists applications. */
export async function GET(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()
  const agencyId = authenticated.memberships[0]?.agency_id
  let q = db.from('agent_applications').select('*, hiring_packages(name, commission_split, role)')
  if (agencyId) q = q.eq('agency_id', agencyId)
  const { data, error } = await q.order('submitted_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, applications: data || [] })
}
