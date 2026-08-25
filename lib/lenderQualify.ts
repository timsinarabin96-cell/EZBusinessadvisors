// =============================================================================
// Lender workflow — client-side API wrapper
// -----------------------------------------------------------------------------
// Agent → lender qualification flow:
//   POST /api/lenders/send     { dealId, lenderId }      — send a deal to a lender
//   POST /api/lenders/respond  { token, status, ... }    — lender qualifies/declines
//   GET  /api/lenders?dealId=  — qualifications for a deal (broker view)
// =============================================================================

export interface LenderQualification {
  id: string
  deal_id: string
  lender_id: string
  agency_id: string
  status: 'requested' | 'sent' | 'viewed' | 'prequalified' | 'declined'
  max_loan_amount: number | null
  terms: string | null
  notes: string | null
  requested_at: string
  viewed_at: string | null
  responded_at: string | null
  lenders?: { name: string; firm: string | null; email: string | null; phone: string | null; avatar_url: string | null } | null
  deals?: { id: string; status: string | null; purchase_price: number | null; listings?: { business_name?: string | null; industry?: string | null; location_general?: string | null; asking_price?: number | null; annual_revenue?: number | null; sde?: number | null } | null } | null
}

async function authed(url: string, init: RequestInit = {}) {
  const { authenticatedFetch } = await import('@/lib/authenticatedFetch')
  return authenticatedFetch(url, init)
}

/** Send a deal to a lender — creates the qualification + lender access link. */
export async function sendDealToLender(dealId: string, lenderId: string): Promise<{ ok: boolean; error?: string; qualification?: LenderQualification; lenderUrl?: string }> {
  const res = await authed('/api/lenders/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealId, lenderId }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Request failed' }))
}

/** List qualifications for a deal (broker view). */
export async function fetchDealQualifications(dealId: string): Promise<LenderQualification[]> {
  try {
    const res = await authed(`/api/lenders?dealId=${encodeURIComponent(dealId)}`)
    const j = await res.json()
    return j.qualifications || []
  } catch {
    return []
  }
}

/** Lender marks a deal prequalified / declined via their secure link. */
export async function respondToQualification(
  token: string,
  status: 'prequalified' | 'declined',
  input: { maxLoanAmount?: number | null; terms?: string; notes?: string },
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/lenders/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, status, ...input }),
  })
  return res.json().catch(() => ({ ok: false, error: 'Request failed' }))
}

/** Public lender link lookup — what a lender sees at /lender/[token]. */
export async function fetchLenderQualification(token: string): Promise<{
  ok: boolean
  error?: string
  qualification?: LenderQualification
  docCount?: number
  docs?: { id: string; file_name: string; file_url: string; file_kind: string | null }[]
}> {
  const res = await fetch(`/api/lenders/qualification?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
  return res.json().catch(() => ({ ok: false, error: 'Request failed' }))
}
