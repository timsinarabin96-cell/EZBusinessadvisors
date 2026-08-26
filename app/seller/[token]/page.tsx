/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /seller/[token] — seller self-service portal.
// Sellers open their private link and see: lead status, listing progress,
// live buyer views + NDA interest, and next steps. Token is the auth — no
// login needed, same pattern as the lender portal.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { fetchSellerPortal, leadStatusLabel, type SellerPortalData } from '@/lib/sellerPortal'
import { ToastProvider } from '@/components/ui/Toast'
import Link from 'next/link'

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Preparing', color: '#b45309', bg: '#fdf3e3' },
  active: { label: 'Live', color: '#15803d', bg: '#e8f7ee' },
  pending_sale: { label: 'Pending Sale', color: '#b45309', bg: '#fdf3e3' },
  under_contract: { label: 'Under Contract', color: '#0e7490', bg: '#e6f6fa' },
  sold: { label: 'Sold', color: '#1a1a2e', bg: '#ece8f5' },
  withdrawn: { label: 'Withdrawn', color: '#dc2626', bg: '#fdeaea' },
}

export default function SellerPortalPage() {
  return (
    <ToastProvider>
      <SellerBody />
    </ToastProvider>
  )
}

function SellerBody() {
  const params = useParams()
  const token = String(params.token || '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<SellerPortalData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetchSellerPortal(token)
    setLoading(false)
    if (!res.ok || !res.lead) {
      setError(res.error || 'Link not found')
      return
    }
    setData(res)
  }, [token])

  useEffect(() => { load() }, [load])

  const listing = data?.listing || null
  const listingStatus = listing ? STATUS_STYLE[listing.status || ''] || STATUS_STYLE.draft : null

  return (
    <div style={{ minHeight: '100vh', background: '#faf9f5', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #2b2b4a)', color: '#fff', padding: '44px 24px 70px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 700 }}>Seller Portal</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, margin: '10px 0 6px' }}>
          {loading ? 'Loading…' : data?.lead?.business_name || 'Your Business'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
          {loading ? 'Fetching your details…' : 'Track your listing — confidentially, anytime.'}
        </p>
      </div>

      <div style={{ maxWidth: 860, margin: '-38px auto 0', padding: '0 20px 60px' }}>
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#999', boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>Loading…</div>
        ) : error ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>Link not found</div>
            <div style={{ fontSize: 13.5, color: '#888', marginTop: 8 }}>{error}</div>
            <Link href="/" style={{ display: 'inline-block', marginTop: 18, color: '#c9a84c', fontWeight: 700 }}>← Back to home</Link>
          </div>
        ) : data && data.lead ? (
          <>
            {/* Status banner */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 8px 30px rgba(26,26,46,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Current status</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>
                  {listing && listingStatus ? listingStatus.label : leadStatusLabel(data.lead.status)}
                </div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
                  {data.lead.industry ? `${data.lead.industry} · ` : ''}{data.lead.location_general || ''}
                  {listing?.asking_price ? ` · ${money(listing.asking_price)}` : ''}
                </div>
              </div>
              {listing && listingStatus && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: listingStatus.color, background: listingStatus.bg, padding: '7px 14px', borderRadius: 999 }}>
                  {listingStatus.label}
                </span>
              )}
            </div>

            {/* Live stats */}
            {listing && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginTop: 16 }}>
                <StatCard label="Buyer views" value={String(data.stats.viewsTotal)} sub={data.stats.views7d > 0 ? `${data.stats.views7d} this week` : 'Total to date'} />
                <StatCard label="Confidential requests" value={String(data.stats.ndaRequests)} sub="Buyers who asked for access" />
                <StatCard label="Listing ref" value={listing.listing_ref || '—'} sub="Your broker reference" />
              </div>
            )}

            {/* Next steps */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '22px 24px', marginTop: 16, boxShadow: '0 8px 30px rgba(26,26,46,0.08)' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>What happens next</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.nextSteps.map((step, i) => (
                  <div key={step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: '#e8edf3', color: '#52606d', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.55 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confidentiality note */}
            <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
              Your information stays strictly confidential. Buyers only see what you approve.
              <br />Questions? Ask your broker — they have the full picture.
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 18px', boxShadow: '0 4px 16px rgba(26,26,46,0.06)' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
