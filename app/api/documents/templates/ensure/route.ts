/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, unauthorizedResponse } from '@/lib/supabase/auth'
import { PACK_TEMPLATES } from '@/lib/legalPackTemplates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// =============================================================================
// /api/documents/templates/ensure — idempotent self-healing seed for the deal
// pack templates (Financial Authorization, Proof of Funds, …).
// -----------------------------------------------------------------------------
// The pack templates live in `document_templates`. The canonical seed is in
// sql/deal_pack_addons_2026_08_26.sql (run in the Supabase SQL editor once),
// but this route guarantees they exist even if that hasn't been run yet — the
// DealDocsPanel calls it on load (fire-and-forget), so the packs are complete
// with zero dashboard work. Server-side service role (bypasses RLS), inserts
// only when the template name is missing. Never throws.
// =============================================================================

interface PackTemplateSeed {
  name: string
  description: string
  category: string
  fields: unknown[]
  parties: unknown[]
  body_template: string
}

export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  let created = 0
  for (const tpl of PACK_TEMPLATES) {
    const { data: existing } = await db
      .from('document_templates')
      .select('id')
      .eq('name', tpl.name)
      .maybeSingle()
    if (existing?.id) continue
    const { error } = await db.from('document_templates').insert({
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      fields: tpl.fields,
      parties: tpl.parties,
      body_template: tpl.body_template,
      is_active: true,
    })
    if (!error) created++
  }

  return NextResponse.json({ ok: true, created, total: PACK_TEMPLATES.length })
}
