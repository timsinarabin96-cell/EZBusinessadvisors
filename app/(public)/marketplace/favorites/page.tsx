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
import { getFavorites, toggleFavorite } from '@/lib/publicFavorites'
import PublicListingCard from '@/components/public/PublicListingCard'
import { LoadingState } from '@/components/ui'

export default function FavoritesPage() {
  const [listings, setListings] = useState<PublicMarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [ids, setIds] = useState<string[]>([])

  useEffect(() => {
    const favIds = getFavorites()
    setIds(favIds)
    ;(async () => {
      const all = await fetchPublicFeed()
      setListings(all.filter((l) => favIds.includes(l.id)))
      setLoading(false)
    })()
  }, [])

  const remove = (id: string) => {
    toggleFavorite(id)
    const next = getFavorites()
    setIds(next)
    setListings((prev) => prev.filter((l) => l.id !== id))
  }

  if (loading) return <LoadingState />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Saved For You</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '8px 0 0' }}>♥ Favorites</h1>
        <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>Saved in this browser — no account needed.</p>
      </div>

      {ids.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>♡</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No favorites yet</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Tap the ♥ on any listing to save it here.{' '}
            <Link href="/marketplace/listings" style={{ color: '#c9a84c', fontWeight: 700 }}>Browse businesses →</Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{listings.length} saved listing{listings.length !== 1 ? 's' : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
            {listings.map((l) => (
              <div key={l.id} style={{ position: 'relative' }}>
                <PublicListingCard listing={l} />
                <button
                  onClick={() => remove(l.id)}
                  style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 3, background: 'rgba(225,29,72,0.92)', color: '#fff', border: 'none', borderRadius: 99, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
