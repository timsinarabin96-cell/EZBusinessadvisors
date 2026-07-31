import { supabase } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Deal Pipeline — configured to the REAL schema (probed live 2026-07-30):
//   deals:     id, listing_id, status, purchase_price, created_at, updated_at
//   listings:  id, business_name, industry, asking_price, status,
//              primary_image_url, headline ...
//
// The board uses `deals.status` as the Kanban column. Business names and
// asking prices are resolved by joining to the linked `listings` row.
// ---------------------------------------------------------------------------

export type DealStage = 'loi' | 'under_contract' | 'due_diligence' | 'closing' | 'closed'

export interface Deal extends Record<string, unknown> {
  id: string
  listing_id: string | null
  status: string
  purchase_price: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface EnrichedDeal extends Deal {
  business_name: string | null
  industry: string | null
  asking_price: number | null
  headline: string | null
  primary_image_url: string | null
}

export interface PipelineItem extends EnrichedDeal {
  stage: DealStage
}

// The five board columns, in order
export const PIPELINE_STAGES: { id: DealStage; label: string }[] = [
  { id: 'loi', label: 'LOI' },
  { id: 'under_contract', label: 'Under Contract' },
  { id: 'due_diligence', label: 'Due Diligence' },
  { id: 'closing', label: 'Closing' },
  { id: 'closed', label: 'Closed' },
]

// A stage is valid if it matches one of the board columns.
// (Deals with any other status value fall through to "closed" handling below.)
export const isKnownStage = (s: string | null | undefined): s is DealStage =>
  !!s && PIPELINE_STAGES.some((st) => st.id === s)

export const stageLabel = (s: string | null | undefined): string =>
  PIPELINE_STAGES.find((st) => st.id === s)?.label || s || 'Unknown'

// ---------------------------------------------------------------------------
// Fetch all deals, enriched with their listing name/price/image.
// ---------------------------------------------------------------------------
export async function fetchPipelineDeals(): Promise<PipelineItem[]> {
  const { data: deals, error } = await supabase.from('deals').select('*')

  if (error) {
    console.error('fetchPipelineDeals error:', error)
    throw new Error(error.message || 'Failed to load deals')
  }

  const dealRows = (deals as Deal[]) || []

  // Collect the distinct listing ids to resolve names
  const listingIds = Array.from(
    new Set(dealRows.map((d) => d.listing_id).filter((id): id is string => !!id))
  )

  let listingMap: Record<string, Partial<ListingSummary>> = {}
  if (listingIds.length > 0) {
    const { data: listings, error: listingError } = await supabase
      .from('listings')
      .select('id, business_name, industry, asking_price, headline, primary_image_url')
      .in('id', listingIds)

    if (!listingError && listings) {
      for (const l of listings) {
        listingMap[l.id] = l
      }
    }
  }

  const items: PipelineItem[] = dealRows.map((d) => {
    const listing = d.listing_id ? listingMap[d.listing_id] : undefined
    const status = d.status || 'loi'
    return {
      ...d,
      business_name: listing?.business_name || null,
      industry: listing?.industry || null,
      asking_price: listing?.asking_price ?? null,
      headline: listing?.headline || null,
      primary_image_url: listing?.primary_image_url || null,
      stage: isKnownStage(status) ? status : 'loi',
    }
  })

  return items
}

interface ListingSummary {
  id: string
  business_name: string | null
  industry: string | null
  asking_price: number | null
  headline: string | null
  primary_image_url: string | null
}

// ---------------------------------------------------------------------------
// Move a deal to a new stage (updates deals.status)
// ---------------------------------------------------------------------------
export async function moveDealStage(id: string, stage: DealStage): Promise<void> {
  const { error } = await supabase.from('deals').update({ status: stage }).eq('id', id)
  if (error) {
    console.error('moveDealStage error:', error)
    throw new Error(error.message || 'Failed to move deal')
  }
}

// ---------------------------------------------------------------------------
// Create a new deal linked to a listing
// ---------------------------------------------------------------------------
export interface DealInput {
  listing_id?: string | null
  status?: DealStage | string
  purchase_price?: number | null
}

export async function createDeal(input: DealInput): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .insert({
      listing_id: input.listing_id || null,
      status: input.status || 'loi',
      purchase_price: input.purchase_price ?? null,
    })
    .select()
    .single()
  if (error) {
    console.error('createDeal error:', error)
    throw new Error(error.message || 'Failed to create deal')
  }
  return data as Deal
}

export async function updateDeal(id: string, input: DealInput): Promise<Deal> {
  const { data, error } = await supabase
    .from('deals')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('updateDeal error:', error)
    throw new Error(error.message || 'Failed to update deal')
  }
  return data as Deal
}

export async function deleteDeal(id: string): Promise<void> {
  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) {
    console.error('deleteDeal error:', error)
    throw new Error(error.message || 'Failed to delete deal')
  }
}

// ---------------------------------------------------------------------------
// Stage duration: how long a deal has been in its CURRENT stage, in days.
// (Best-effort: uses updated_at as the proxy for when status last changed.)
// ---------------------------------------------------------------------------
export function stageDurationDays(deal: Deal): string | null {
  const ref = deal.updated_at || deal.created_at
  if (!ref) return null
  const days = Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 86400000))
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
export const formatMoney = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}
