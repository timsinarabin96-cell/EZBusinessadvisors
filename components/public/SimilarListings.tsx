/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { searchPublicListings, type PublicMarketplaceListing } from '@/lib/marketplace'
import PublicListingCard from '@/components/public/PublicListingCard'

/**
 * "Similar businesses" — deterministic, zero-token recommendation engine.
 * Same industry first, then same sub-industry/location, then price range.
 * Pure client-side rules; no LLM, $0 per view.
 */
export default function SimilarListings({ listing }: { listing: PublicMarketplaceListing }) {
  const [similar, setSimilar] = useState<PublicMarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const all = await searchPublicListings({ industry: listing.industry || undefined })
      const rest = all.filter((l) => l.id !== listing.id)

      const score = (l: PublicMarketplaceListing): number => {
        let points = 0
        if (l.industry && listing.industry && l.industry.toLowerCase() === listing.industry.toLowerCase()) points += 40
        if (l.sub_industry && listing.sub_industry && l.sub_industry.toLowerCase() === listing.sub_industry.toLowerCase()) points += 30
        if (l.location_general && listing.location_general && l.location_general.toLowerCase() === listing.location_general.toLowerCase()) points += 20
        if (l.asking_price != null && listing.asking_price != null) {
          const ratio = Math.max(l.asking_price, listing.asking_price) / Math.min(l.asking_price, listing.asking_price)
          if (ratio <= 1.5) points += 10
        }
        return points
      }

      const ranked = rest
        .map((l) => ({ l, points: score(l) }))
        .filter((x) => x.points >= 40)
        .sort((a, b) => b.points - a.points)
        .slice(0, 3)
        .map((x) => x.l)

      if (!cancelled) setSimilar(ranked)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id])

  if (loading) return null
  if (similar.length === 0) return null

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>You Might Also Like</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e', margin: '6px 0 0' }}>Similar Businesses</h2>
        </div>
        <Link href={`/marketplace/listings?industry=${encodeURIComponent(listing.industry || '')}`} style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none', fontSize: 14 }}>
          View all {listing.industry || 'similar'} →
        </Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {similar.map((l) => (
          <PublicListingCard key={l.id} listing={l} />
        ))}
      </div>
    </div>
  )
}
