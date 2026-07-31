import { supabase } from '@/lib/supabase/client'
import { createDeal } from '@/lib/pipeline'

// ---------------------------------------------------------------------------
// Unified Lead Management — buyer + seller leads.
// Real schema (probed live):
//   seller_leads: id, business_name, email, phone, status, created_at
//   buyer_leads:  id, email, phone, status, created_at
//   lead_activities: (create via sql files) id, lead_id, type, description, created_at
// ---------------------------------------------------------------------------

export type LeadStatus = 'new' | 'qualifying' | 'qualified' | 'handed_off' | 'not_a_fit'

export const LEAD_STATUSES: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'new', label: 'New', color: '#3b82f6' },
  { id: 'qualifying', label: 'Qualifying', color: '#f59e0b' },
  { id: 'qualified', label: 'Qualified', color: '#8b5cf6' },
  { id: 'handed_off', label: 'Handed Off', color: '#22c55e' },
  { id: 'not_a_fit', label: 'Not a Fit', color: '#ef4444' },
]

export const statusMeta = (s?: string | null) =>
  LEAD_STATUSES.find((x) => x.id === s) || { id: s || 'new', label: s || 'New', color: '#94a3b8' }

export type LeadKind = 'buyer' | 'seller'

export interface UnifiedLead {
  kind: LeadKind
  id: string
  business_name: string | null
  email: string | null
  phone: string | null
  status: string
  created_at?: string | null
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
export async function fetchAllLeads(): Promise<UnifiedLead[]> {
  const results = await Promise.allSettled([
    supabase.from('seller_leads').select('*').order('created_at', { ascending: false }),
    supabase.from('buyer_leads').select('*').order('created_at', { ascending: false }),
  ])

  const rows: UnifiedLead[] = []

  const seller = results[0]
  if (seller.status === 'fulfilled' && seller.value.data) {
    for (const r of seller.value.data) {
      rows.push({
        kind: 'seller', id: r.id, business_name: r.business_name, email: r.email,
        phone: r.phone, status: r.status || 'new', created_at: r.created_at,
      })
    }
  }

  const buyer = results[1]
  if (buyer.status === 'fulfilled' && buyer.value.data) {
    for (const r of buyer.value.data) {
      rows.push({
        kind: 'buyer', id: r.id, business_name: null, email: r.email,
        phone: r.phone, status: r.status || 'new', created_at: r.created_at,
      })
    }
  }

  // Sort: newest first
  rows.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  return rows
}

// ---------------------------------------------------------------------------
// Create / Update / Delete (per kind)
// ---------------------------------------------------------------------------
export async function createLead(kind: LeadKind, input: {
  business_name?: string; email?: string; phone?: string; status?: LeadStatus
}): Promise<UnifiedLead> {
  const table = kind === 'seller' ? 'seller_leads' : 'buyer_leads'
  const payload: Record<string, unknown> = {
    email: input.email || null,
    phone: input.phone || null,
    status: input.status || 'new',
  }
  if (kind === 'seller') payload.business_name = input.business_name || ''

  const { data, error } = await supabase.from(table).insert(payload).select().single()
  if (error) {
    console.error('createLead error:', error)
    throw new Error(error.message || 'Failed to create lead')
  }
  return {
    kind, id: data.id, business_name: data.business_name || null,
    email: data.email, phone: data.phone, status: data.status || 'new', created_at: data.created_at,
  }
}

export async function updateLead(kind: LeadKind, id: string, input: {
  business_name?: string; email?: string; phone?: string; status?: LeadStatus
}): Promise<UnifiedLead> {
  const table = kind === 'seller' ? 'seller_leads' : 'buyer_leads'
  const payload: Record<string, unknown> = { status: input.status }
  if (kind === 'seller' && input.business_name !== undefined) payload.business_name = input.business_name
  if (input.email !== undefined) payload.email = input.email || null
  if (input.phone !== undefined) payload.phone = input.phone || null

  const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
  if (error) {
    console.error('updateLead error:', error)
    throw new Error(error.message || 'Failed to update lead')
  }
  return {
    kind, id: data.id, business_name: data.business_name || null,
    email: data.email, phone: data.phone, status: data.status || 'new', created_at: data.created_at,
  }
}

export async function deleteLead(kind: LeadKind, id: string): Promise<void> {
  const table = kind === 'seller' ? 'seller_leads' : 'buyer_leads'
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    console.error('deleteLead error:', error)
    throw new Error(error.message || 'Failed to delete lead')
  }
}

// ---------------------------------------------------------------------------
// Convert a lead into a deal in the pipeline.
// - Seller lead -> creates a deal (status 'loi'); optionally ties to a listing.
// - Buyer lead -> also creates a deal; we attach the buyer's email as the
//   deal's only identifier since deals table has no buyer fields.
// ---------------------------------------------------------------------------
export async function convertLeadToDeal(
  lead: UnifiedLead,
  listingId?: string
): Promise<{ dealId: string }> {
  const dealNameBase = lead.business_name || lead.email || 'Lead'
  const deal = await createDeal({
    listing_id: listingId || null,
    status: 'loi',
    purchase_price: null,
  })
  const dealId = deal.id

  // Log activity on the lead (fail-soft if lead_activities missing)
  try {
    await supabase.from('lead_activities').insert({
      lead_id: lead.id,
      type: 'conversion',
      description: `Converted ${lead.kind} lead "${dealNameBase}" into deal ${dealId.slice(0, 8)}.`,
    })
  } catch {
    // ignore — activity table may not exist
  }

  // Mark the lead handed off
  try {
    const table = lead.kind === 'seller' ? 'seller_leads' : 'buyer_leads'
    await supabase.from(table).update({ status: 'handed_off' }).eq('id', lead.id)
  } catch {
    // ignore
  }

  return { dealId }
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
export interface LeadActivity {
  id: string
  lead_id: string
  type: string
  description: string
  created_at?: string | null
}

export async function fetchLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data as LeadActivity[]) || []
}

export async function addLeadActivity(leadId: string, type: string, description: string): Promise<LeadActivity | null> {
  const { data, error } = await supabase
    .from('lead_activities')
    .insert({ lead_id: leadId, type, description })
    .select()
    .single()
  if (error) {
    console.warn('addLeadActivity error:', error.message)
    return null
  }
  return data as LeadActivity
}

// ---------------------------------------------------------------------------
// Counts for dashboard
// ---------------------------------------------------------------------------
export async function fetchLeadStats(): Promise<{ total: number; newLeads: number; buyers: number; sellers: number }> {
  const all = await fetchAllLeads()
  return {
    total: all.length,
    newLeads: all.filter((l) => l.status === 'new').length,
    buyers: all.filter((l) => l.kind === 'buyer').length,
    sellers: all.filter((l) => l.kind === 'seller').length,
  }
}

export const initials = (name: string | null | undefined): string => {
  if (!name) return '?'
  return name.trim().split(/\s+/).map((n) => n[0] || '').join('').toUpperCase().slice(0, 2)
}
