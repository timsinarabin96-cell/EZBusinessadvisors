/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { validationErrorJson } from '@/lib/friendlyValidation'
import { isPlatformAdmin } from '@/lib/platform'
import { saveAgencyTheme } from '@/lib/agencyTheme'

export const runtime = 'nodejs'

// =============================================================================
// /api/admin/white-label — platform-admin white-label marketplace manager.
//   GET               → every agency with its theme (or defaults) + domains
//   POST              → upsert an agency's white-label theme
//   POST /?action=reset&agencyId=… → clear theme back to defaults
// Platform admin only (this is the "sell your own BizBuySell" control room).
// =============================================================================

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
})

export async function GET(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const { data: agencies, error } = await db
    .from('agencies')
    .select('id, name, slug, domain, custom_domain, logo_url, is_active, created_at')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: 'query failed' }, { status: 500 })

  // Add-on flags (financial intelligence, etc.) for the sellable packaging.
  const { data: settings } = await db.from('agency_settings').select('agency_id, financial_intelligence_enabled')
  const settingsMap = new Map((settings || []).map((s: any) => [s.agency_id, s]))

  const { data: themes } = await db.from('agency_site_themes').select('*')
  const themeMap = new Map((themes || []).map((t: any) => [t.agency_id, t]))

  const rows = (agencies || []).map((a: any) => ({
    agency_id: a.id,
    name: a.name,
    slug: a.slug,
    domain: a.domain,
    custom_domain: a.custom_domain,
    logo_url: a.logo_url,
    is_active: a.is_active,
    financial_intelligence_enabled: Boolean(settingsMap.get(a.id)?.financial_intelligence_enabled ?? true),
    theme: themeMap.get(a.id) || null,
  }))

  return NextResponse.json({ ok: true, agencies: rows })
}

export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin(req))) {
    return NextResponse.json({ ok: false, error: 'Platform admin access only' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  // Reset-to-defaults mode
  if (sp.get('action') === 'reset') {
    const agencyId = sp.get('agencyId')
    if (!agencyId) return NextResponse.json({ ok: false, error: 'agencyId required' }, { status: 400 })
    const { error } = await db.from('agency_site_themes').delete().eq('agency_id', agencyId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reset: true })
  }

  // Add-on toggle mode: { action: 'addon', agencyId, addon: 'financial_intelligence', enabled }
  if (sp.get('action') === 'addon') {
    const agencyId = sp.get('agencyId')
    const addon = sp.get('addon')
    const enabled = sp.get('enabled') === '1'
    if (!agencyId || !addon) return NextResponse.json({ ok: false, error: 'agencyId and addon required' }, { status: 400 })
    if (addon === 'financial_intelligence') {
      const { error } = await db.from('agency_settings').upsert(
        { agency_id: agencyId, financial_intelligence_enabled: enabled, updated_at: new Date().toISOString() },
        { onConflict: 'agency_id' },
      )
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, addon, enabled })
    }
    return NextResponse.json({ ok: false, error: 'Unknown addon' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = themePatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      validationErrorJson(parsed.error), { status: 422 },
    )
  }
  const { agencyId, ...patch } = parsed.data

  // Does the agency exist?
  const { data: agency } = await db.from('agencies').select('id').eq('id', agencyId).maybeSingle()
  if (!agency) return NextResponse.json({ ok: false, error: 'Agency not found' }, { status: 404 })

  const result = await saveAgencyTheme(agencyId, patch)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error || 'Save failed' }, { status: 500 })

  // Keep agencies.custom_domain in sync so host resolution (resolveAgencyThemeByHost)
  // picks up domain changes immediately.
  if (patch.custom_domain !== undefined) {
    await db.from('agencies').update({ custom_domain: patch.custom_domain || null }).eq('id', agencyId)
  }

  return NextResponse.json({ ok: true })
}
