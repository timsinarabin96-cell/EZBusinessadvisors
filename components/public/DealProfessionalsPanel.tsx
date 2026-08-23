'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { matchProfessionalsForListing, PROFESSIONAL_LABELS, type DealProfessional } from '@/lib/professionals'
import type { PublicMarketplaceListing } from '@/lib/marketplace'

/**
 * "Professionals for this deal" — matches the listing's industry + geography
 * to vetted lawyers, CPAs, QoE agents, lenders, and consultants. Zero-token
 * deterministic matching; advisory only.
 */
export default function DealProfessionalsPanel({ listing }: { listing: PublicMarketplaceListing }) {
  const [pros, setPros] = useState<DealProfessional[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const matched = await matchProfessionalsForListing({
        industry: listing.industry,
        sub_industry: listing.sub_industry,
        location_general: listing.location_general,
        country_code: listing.country_code || 'US',
      }, 4)
      if (!cancelled) setPros(matched)
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id])

  if (loading) return null
  if (pros.length === 0) return null

  return (
    <div style={{ marginTop: 40, background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, boxShadow: '0 1px 6px rgba(26,26,46,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Deal Team</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: '6px 0 0' }}>
            Professionals for this deal
          </h2>
          <p style={{ color: '#888', fontSize: 13.5, margin: '6px 0 0' }}>
            Vetted attorneys, CPAs, QoE agents, and lenders who work with business buyers and sellers.
          </p>
        </div>
        <Link href="/marketplace/professionals" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none', fontSize: 14 }}>
          Browse all professionals →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {pros.map((p) => (
          <Link key={p.id} href={`/marketplace/professionals/${p.id}`} style={{ textDecoration: 'none', display: 'block', border: '1px solid #ece8dc', borderRadius: 12, padding: 16, background: '#fcfbf7', transition: 'transform .15s ease' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e' }}>
              {p.name} {p.is_platform_verified && <span title="Platform verified" style={{ fontSize: 12 }}>✅</span>}
            </div>
            <div style={{ fontSize: 12.5, color: '#0e7490', fontWeight: 700, marginTop: 3 }}>
              {PROFESSIONAL_LABELS[p.professional_type]}{p.firm ? ` · ${p.firm}` : ''}
            </div>
            {p.specialty && <div style={{ fontSize: 12, color: '#7b8794', marginTop: 4 }}>{p.specialty}</div>}
            <div style={{ fontSize: 12, color: '#7b8794', marginTop: 8 }}>
              {p.years_experience ? `${p.years_experience}+ yrs` : 'Verified'} · {p.deals_closed ? `${p.deals_closed}+ deals` : 'Confidential'}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
