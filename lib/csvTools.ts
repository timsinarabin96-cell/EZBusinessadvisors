/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// CSV Tools — import/export for listings and leads
// -----------------------------------------------------------------------------
// Export listings / buyer leads / seller leads to CSV and import leads from
// pasted CSV. Server-only; never throws.
// =============================================================================

import { createClient } from '@supabase/supabase-js'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

const esc = (v: unknown): string => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (headers: string[], rows: unknown[][]): string =>
  [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')

/** Export listings for an agency as CSV. */
export async function exportListingsCsv(agencyId: string): Promise<string> {
  if (!svc) return ''
  const { data } = await svc
    .from('listings')
    .select('business_name, asking_price, annual_revenue, sde, industry, sub_industry, location_general, status, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(2000)
  const rows = (data || []).map((l: any) => [
    l.business_name,
    l.asking_price,
    l.annual_revenue,
    l.sde,
    l.industry,
    l.sub_industry,
    l.location_general,
    l.status,
    l.created_at,
  ])
  return toCsv(
    ['business_name', 'asking_price', 'annual_revenue', 'sde', 'industry', 'sub_industry', 'location_general', 'status', 'created_at'],
    rows,
  )
}

/** Export buyer leads as CSV. */
export async function exportBuyerLeadsCsv(agencyId: string): Promise<string> {
  if (!svc) return ''
  const { data } = await svc
    .from('buyer_leads')
    .select('contact_name, company, email, phone, industry_interest, budget_range, status, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(2000)
  const rows = (data || []).map((l: any) => [
    l.contact_name,
    l.company,
    l.email,
    l.phone,
    l.industry_interest,
    l.budget_range,
    l.status,
    l.created_at,
  ])
  return toCsv(
    ['contact_name', 'company', 'email', 'phone', 'industry_interest', 'budget_range', 'status', 'created_at'],
    rows,
  )
}

/** Export seller leads as CSV. */
export async function exportSellerLeadsCsv(agencyId: string): Promise<string> {
  if (!svc) return ''
  const { data } = await svc
    .from('seller_leads')
    .select('business_name, contact_name, email, phone, asking_price, industry, status, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(2000)
  const rows = (data || []).map((l: any) => [
    l.business_name,
    l.contact_name,
    l.email,
    l.phone,
    l.asking_price,
    l.industry,
    l.status,
    l.created_at,
  ])
  return toCsv(
    ['business_name', 'contact_name', 'email', 'phone', 'asking_price', 'industry', 'status', 'created_at'],
    rows,
  )
}

/** Minimal CSV parser (handles quoted commas + escaped quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = []
  let cur = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(cur); cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      if (row.length > 1 || row[0] !== '') { lines.push(row); row = [] }
    } else {
      cur += ch
    }
  }
  row.push(cur)
  if (row.length > 1 || row[0] !== '') lines.push(row)
  if (!lines.length) return []

  const headers = lines[0].map((h) => h.trim())
  return lines.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (r[i] || '').trim() })
    return obj
  })
}

/** Import leads (buyer or seller) from parsed CSV rows. */
export async function importLeads(
  agencyId: string,
  type: 'buyer' | 'seller',
  rows: Record<string, string>[],
): Promise<{ imported: number; errors: string[] }> {
  if (!svc) return { imported: 0, errors: ['Database is not configured'] }
  let imported = 0
  const errors: string[] = []

  for (const [idx, row] of rows.entries()) {
    const email = (row.email || '').trim()
    if (!email.includes('@')) {
      errors.push(`Row ${idx + 1}: missing or invalid email`)
      continue
    }
    const payload: Record<string, unknown> = { agency_id: agencyId, email }
    if (type === 'buyer') {
      payload.contact_name = row.contact_name || null
      payload.company = row.company || null
      payload.phone = row.phone || null
      payload.industry_interest = row.industry_interest || null
      payload.budget_range = row.budget_range || null
      payload.status = 'new'
    } else {
      payload.business_name = row.business_name || null
      payload.contact_name = row.contact_name || null
      payload.phone = row.phone || null
      payload.asking_price = row.asking_price ? Number(row.asking_price) : null
      payload.industry = row.industry || null
      payload.status = 'new'
    }
    const { error } = await svc.from(type === 'buyer' ? 'buyer_leads' : 'seller_leads').insert(payload)
    if (error) errors.push(`Row ${idx + 1}: ${error.message}`)
    else imported++
  }
  return { imported, errors }
}
