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

const PACK_TEMPLATES: PackTemplateSeed[] = [
  {
    name: 'Financial Authorization',
    description: 'Seller authorizes the broker to verify business financials directly with their accountant/CPA — P&Ls, tax returns, and bank statements.',
    category: 'Seller Pack',
    fields: [
      { key: 'seller_name', label: 'Seller Name', type: 'text', required: true },
      { key: 'business_name', label: 'Business Name', type: 'text', required: true },
      { key: 'cpa_name', label: 'Accountant / CPA Name', type: 'text', required: true },
      { key: 'cpa_firm', label: 'Accountant Firm', type: 'text', required: false },
      { key: 'cpa_email', label: 'Accountant Email', type: 'text', required: false },
      { key: 'cpa_phone', label: 'Accountant Phone', type: 'text', required: false },
      { key: 'effective_date', label: 'Effective Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Agent', role: 'agent' },
      { key: 'seller', label: 'Seller', role: 'seller' },
    ],
    body_template: `{{title}}\n\nEffective Date: {{effective_date}}\n\nI, {{seller_name}}, as owner of {{business_name}}, hereby authorize Concord Deal Platform and its designated broker/agent to contact and obtain financial records from my accountant {{cpa_name}} ({{cpa_firm}}) for the purpose of preparing a normalized financial statement and valuation of the business.\n\nAuthorized records include, but are not limited to: profit & loss statements, tax returns, bank statements, and supporting schedules for the most recent fiscal years.\n\nAccountant contact: {{cpa_email}} · {{cpa_phone}}\n\nThis authorization remains in effect until the engagement concludes or is revoked in writing.`,
  },
  {
    name: 'Proof of Funds',
    description: 'Buyer documents liquid assets available for the acquisition — the qualification gate that separates serious buyers from tire-kickers.',
    category: 'Buyer Pack',
    fields: [
      { key: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
      { key: 'buyer_email', label: 'Buyer Email', type: 'text', required: true },
      { key: 'bank_name', label: 'Financial Institution', type: 'text', required: true },
      { key: 'account_type', label: 'Account Type', type: 'select', required: true, options: ['Checking', 'Savings', 'Money Market', 'Investment / Brokerage', 'Retirement (non-pledged)', 'Other'] },
      { key: 'liquid_assets', label: 'Liquid Assets Available ($)', type: 'number', required: true, placeholder: 'e.g. 250000' },
      { key: 'pof_date', label: 'Date', type: 'date', required: true },
    ],
    parties: [
      { key: 'agent', label: 'Agent', role: 'agent' },
      { key: 'buyer', label: 'Buyer', role: 'buyer' },
    ],
    body_template: `{{title}}\n\nDate: {{pof_date}}\n\nI, {{buyer_name}} ({{buyer_email}}), confirm that I have liquid assets of approximately \${{liquid_assets}} available for the acquisition of a business, held at {{bank_name}} ({{account_type}}).\n\nI understand that the broker may request a bank statement or letter from the financial institution to verify these funds before full financials are shared.\n\nThis statement is made in good faith for the purpose of qualifying my interest.`,
  },
]

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
