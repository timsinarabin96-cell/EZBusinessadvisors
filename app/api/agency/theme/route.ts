import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canManageAgency, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'
import { saveAgencyTheme, getAgencyTheme } from '@/lib/agencyTheme'

export const runtime = 'nodejs'

const themePatchSchema = z.object({
  agencyId: z.string().uuid(),
  custom_domain: z.string().max(200).nullable().optional(),
  logo_url: z.string().max(500).nullable().optional(),
  favicon_url: z.string().max(500).nullable().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  heading_font: z.string().max(80).optional(),
  body_font: z.string().max(80).optional(),
  hero_style: z.string().max(40).optional(),
  listing_card_style: z.string().max(40).optional(),
  business_model: z.string().max(60).optional(),
  navigation: z.array(z.unknown()).optional(),
  homepage_sections: z.array(z.unknown()).optional(),
  legal_disclosures: z.record(z.string(), z.unknown()).optional(),
})

/**
 * GET /api/agency/theme?agencyId=... — public theme (used by white-label sites)
 * POST /api/agency/theme — save theme (broker/admin of that agency only)
 */
export async function GET(req: NextRequest) {
  const agencyId = req.nextUrl.searchParams.get('agencyId')
  if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId required' }, { status: 400 })
  const theme = await getAgencyTheme(agencyId)
  return NextResponse.json({ ok: true, theme })
}

export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }
  const parsed = themePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Validation failed', detail: parsed.error.issues[0]?.message }, { status: 422 })
  }
  const { agencyId, ...patch } = parsed.data
  if (!canManageAgency(authenticated, agencyId)) return forbiddenResponse()

  const result = await saveAgencyTheme(agencyId, patch)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
