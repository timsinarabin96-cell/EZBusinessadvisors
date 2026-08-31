/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Due Diligence Tracker
// due_diligence_items real columns: id, deal_id, title, status, due_date,
// created_at. Plus added: category, assignee, notes (via sql/full_schema.sql).
// ---------------------------------------------------------------------------

export type DDStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'waived'

export const DD_STATUSES: { id: DDStatus; label: string; color: string }[] = [
  { id: 'pending', label: 'Pending', color: '#94a3b8' },
  { id: 'in_review', label: 'In Review', color: '#f59e0b' },
  { id: 'approved', label: 'Approved', color: '#22c55e' },
  { id: 'rejected', label: 'Rejected', color: '#ef4444' },
  { id: 'waived', label: 'Waived', color: '#8b5cf6' },
]

export const statusMeta = (s?: string | null) =>
  DD_STATUSES.find((x) => x.id === s) || { id: 'pending', label: 'Pending', color: '#94a3b8' }

export interface DDItem {
  id: string
  deal_id: string | null
  title: string
  category: string | null
  status: string
  due_date: string | null
  assignee: string | null
  notes: string | null
  created_at?: string | null
}

export interface DDInput {
  deal_id: string
  title: string
  category?: string
  status?: DDStatus
  due_date?: string | null
  assignee?: string | null
  notes?: string | null
}

export async function fetchDDItems(dealId?: string): Promise<DDItem[]> {
  let q = supabase.from('due_diligence_items').select('*')
  if (dealId) q = q.eq('deal_id', dealId)
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) {
    console.error('fetchDDItems error:', error)
    throw new Error(error.message || 'Failed to load due diligence items')
  }
  return (data as DDItem[]) || []
}

export async function createDDItem(input: DDInput): Promise<DDItem> {
  const { data, error } = await supabase
    .from('due_diligence_items')
    .insert({
      deal_id: input.deal_id,
      title: input.title,
      category: input.category || 'General',
      status: input.status || 'pending',
      due_date: input.due_date || null,
      assignee: input.assignee || null,
      notes: input.notes || null,
    })
    .select()
    .single()
  if (error) {
    console.error('createDDItem error:', error)
    throw new Error(error.message || 'Failed to create due diligence item')
  }
  // #16 gate-transition notification: the agent is pinged when a new DD item
  // lands so nothing sits unaddressed (stalled-deal detection stays manual).
  try {
    const { createNotification } = await import('@/lib/notifications')
    if (input.deal_id) {
      const { data: deal } = await supabase.from('deals').select('agency_id, listing_id, listings(business_name)').eq('id', input.deal_id).maybeSingle()
      const agencyId = (deal as { agency_id?: string | null } | null)?.agency_id
      if (agencyId) {
        const name = ((deal as any)?.listings?.business_name as string | null) || 'deal'
        await createNotification({
          agency_id: agencyId,
          title: `Due diligence item added: ${input.title}`,
          body: `A new due-diligence item (${input.category || 'General'}) was added to ${name}.`, 
          kind: 'due_diligence',
        })
      }
    }
  } catch { /* notification best-effort */ }
  return data as DDItem
}

export async function updateDDItem(id: string, input: Partial<DDInput>): Promise<DDItem> {
  const { data, error } = await supabase
    .from('due_diligence_items')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('updateDDItem error:', error)
    throw new Error(error.message || 'Failed to update due diligence item')
  }
  return data as DDItem
}

export async function deleteDDItem(id: string): Promise<void> {
  const { error } = await supabase.from('due_diligence_items').delete().eq('id', id)
  if (error) {
    console.error('deleteDDItem error:', error)
    throw new Error(error.message || 'Failed to delete due diligence item')
  }
}

// ---------------------------------------------------------------------------
// #10 standard DD checklist template + industry-aware Claude suggestions
// (spec Phase 6: standard template + listing-specific items).
// ---------------------------------------------------------------------------
export const DD_CHECKLIST_TEMPLATE: { title: string; category: string }[] = [
  { title: 'Signed Purchase Agreement', category: 'Legal' },
  { title: '3 Years Tax Returns (entity + personal)', category: 'Tax Returns' },
  { title: 'YTD P&L and Balance Sheet', category: 'Financials' },
  { title: 'Customer List / Concentration Report', category: 'Operations' },
  { title: 'Employee Roster with Wages + Tenure', category: 'HR & Employees' },
  { title: 'Lease Agreement + Estoppel', category: 'Real Estate & Lease' },
  { title: 'Equipment & FF&E Inventory', category: 'Operations' },
  { title: 'Insurance Policies (GL, WC, E&O)', category: 'Insurance' },
  { title: 'Key Supplier / Vendor Contracts', category: 'Contracts' },
  { title: 'Licenses & Permits', category: 'Legal' },
  { title: 'Bank Statements (12 months)', category: 'Financials' },
  { title: 'Proof of Funds / Financing Commitment', category: 'Financials' },
]

/** Industry-specific extra DD items (Claude-suggested per business type). */
export function industryDdSuggestions(industry: string | null | undefined): { title: string; category: string }[] {
  const i = (industry || '').toLowerCase()
  if (/home care|healthcare|medical|home health/i.test(i)) {
    return [
      { title: 'State License + Survey/Inspection History', category: 'Legal' },
      { title: 'Medicaid/Insurance Provider Agreements', category: 'Contracts' },
      { title: 'Client Care Records Consent (HIPAA)', category: 'Legal' },
    ]
  }
  if (/restaurant|food|bar|cafe/i.test(i)) {
    return [
      { title: 'Health Department Inspection Reports', category: 'Legal' },
      { title: 'Liquor License (if applicable)', category: 'Legal' },
      { title: 'Food Supplier Contracts', category: 'Contracts' },
    ]
  }
  if (/retail|ecommerce|e-commerce|online/i.test(i)) {
    return [
      { title: 'Top-SKU Sales Breakdown (12 months)', category: 'Operations' },
      { title: 'Platform/Shopify/Amazon Account Access Plan', category: 'Operations' },
      { title: 'Supplier/COGS Breakdown', category: 'Financials' },
    ]
  }
  if (/manufactur|industrial|wholesale/i.test(i)) {
    return [
      { title: 'Equipment Maintenance Logs', category: 'Operations' },
      { title: 'Environmental Compliance Certificates', category: 'Legal' },
      { title: 'Top-Customer Contracts', category: 'Contracts' },
    ]
  }
  return []
}

export const isOverdue = (item: DDItem): boolean => {
  if (!item.due_date) return false
  const due = new Date(item.due_date + 'T00:00:00')
  return due < new Date() && item.status !== 'approved' && item.status !== 'waived'
}
