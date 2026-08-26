/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPublicFeed, type PublicMarketplaceListing } from '@/lib/marketplace'
import { getCompare } from '@/lib/publicFavorites'
import { fmt$ } from '@/lib/recast'
import { LoadingState } from '@/components/ui'

export default function ComparePage() {
  const [listings, setListings] = useState<PublicMarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Support shareable links: /marketplace/compare?ids=a,b,c
    const params = new URLSearchParams(window.location.search)
    const fromUrl = (params.get('ids') || '').split(',').filter(Boolean)
    const ids = fromUrl.length ? fromUrl : getCompare()
    ;(async () => {
      const all = await fetchPublicFeed()
      const selected = all.filter((l) => ids.includes(l.id))
      // Keep the order the user selected.
      const ordered = ids.map((id) => selected.find((l) => l.id === id)).filter(Boolean) as PublicMarketplaceListing[]
      setListings(ordered)
      setLoading(false)
    })()
  }, [])

  const shareLink = async () => {
    const ids = getCompare()
    if (!ids.length) return
    const url = `${window.location.origin}/marketplace/compare?ids=${ids.join(',')}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this compare link:', url)
    }
  }

  if (loading) return <LoadingState />

  const rows: { label: string; value: (l: PublicMarketplaceListing) => string }[] = [
    { label: 'Industry', value: (l) => l.industry || '—' },
    { label: 'Location', value: (l) => l.location_general || 'Confidential' },
    { label: 'Pricing', value: (l) => 'On application' },
    { label: 'Annual Revenue', value: (l) => (l.annual_revenue !== null ? fmt$(l.annual_revenue) : '—') },
    { label: 'SDE', value: (l) => (l.sde !== null ? fmt$(l.sde) : '—') },
    { label: 'EBITDA', value: (l) => (l.ebitda !== null ? fmt$(l.ebitda) : '—') },
    { label: 'Employees (FT)', value: (l) => (l.employees_full_time != null ? String(l.employees_full_time) : '—') },
    { label: 'Established', value: (l) => (l.established_year ? String(l.established_year) : '—') },
    { label: 'Financing', value: (l) => (l.seller_financing_available ? '✓ Available' : '—') },
    { label: 'Absentee', value: (l) => (l.is_absentee_owner ? '✓' : '—') },
    { label: 'Franchise', value: (l) => (l.is_franchise ? '✓' : '—') },
    { label: 'Relocatable', value: (l) => (l.is_relocatable ? '✓' : '—') },
  ]

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Deal Comparison</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '8px 0 0' }}>⚖ Compare Businesses</h1>
            <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Side-by-side view of up to 3 selected listings.</p>
          </div>
          {listings.length > 0 && (
            <button
              onClick={shareLink}
              style={{
                background: copied ? '#22c55e' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              }}
            >
              {copied ? '✓ Link copied!' : '🔗 Share this comparison'}
            </button>
          )}
        </div>
      </div>

      {listings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚖</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Nothing to compare yet</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Tap the ⚖ button on up to 3 listings, then come back here.{' '}
            <Link href="/marketplace/listings" style={{ color: '#c9a84c', fontWeight: 700 }}>Browse businesses →</Link>
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 14, fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #ece8dc' }}>Attribute</th>
                {listings.map((l) => (
                  <th key={l.id} style={{ padding: 14, borderBottom: '2px solid #ece8dc', textAlign: 'left' }}>
                    <Link href={`/marketplace/listings/${l.slug || l.id}`} style={{ color: '#1a1a2e', textDecoration: 'none', fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700 }}>
                      {l.public_title}
                    </Link>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{l.industry || ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#777', fontWeight: 600, borderBottom: '1px solid #f0ecdf' }}>{row.label}</td>
                  {listings.map((l) => (
                    <td key={l.id} style={{ padding: '10px 14px', fontSize: 14, color: '#1a1a2e', fontWeight: 700, borderBottom: '1px solid #f0ecdf' }}>
                      {row.value(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
