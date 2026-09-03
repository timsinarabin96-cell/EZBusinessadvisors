/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { fetchPublicFeed, type PublicMarketplaceListing } from '@/lib/marketplace'
import {
  getFavorites,
  toggleFavorite,
  getSavedEmail,
  setSavedIdentity,
  clearSavedIdentity,
  syncSavedListing,
  fetchSavedIds,
} from '@/lib/publicFavorites'
import PublicListingCard from '@/components/public/PublicListingCard'
import { LoadingState } from '@/components/ui'

export default function FavoritesPage() {
  const searchParams = useSearchParams()
  const [listings, setListings] = useState<PublicMarketplaceListing[]>([])
  const [loading, setLoading] = useState(true)
  const [ids, setIds] = useState<string[]>([])
  const [email, setEmail] = useState<string | null>(null)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    // Emailed link carries ?email=&token= → store identity, then show that list.
    const linkEmail = (searchParams.get('email') || '').trim().toLowerCase()
    const linkToken = (searchParams.get('token') || '').trim()
    if (linkEmail && linkToken) setSavedIdentity(linkEmail, linkToken)

    const savedEmail = getSavedEmail()
    setEmail(savedEmail)

    const localIds = getFavorites()
    ;(async () => {
      let merged = new Set(localIds)
      let serverMerged = false
      if (savedEmail) {
        const serverIds = await fetchSavedIds()
        if (serverIds) {
          for (const id of serverIds) merged.add(id)
          serverMerged = true
        }
      }
      // Merge server ids into the local cache so hearts stay consistent.
      if (serverMerged) {
        const mergedList = [...merged]
        const nextLocal = mergedList.filter((id) => !localIds.includes(id))
        for (const id of nextLocal) toggleFavorite(id)
      }
      const all = await fetchPublicFeed()
      const live = all.filter((l) => merged.has(l.id))
      // Cleanse: ids that no longer resolve are gone deals — drop locally so the
      // list only ever shows what's actually live.
      const liveIds = new Set(live.map((l) => l.id))
      const deadLocal = localIds.filter((id) => !liveIds.has(id))
      for (const id of deadLocal) {
        if (getFavorites().includes(id)) toggleFavorite(id)
        if (savedEmail) void syncSavedListing(id, false)
      }
      setIds([...liveIds].filter((id) => merged.has(id)))
      setListings(live)
      setSynced(true)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = (id: string) => {
    toggleFavorite(id)
    setIds((prev) => prev.filter((x) => x !== id))
    setListings((prev) => prev.filter((l) => l.id !== id))
    if (getSavedEmail()) void syncSavedListing(id, false)
  }

  const forgetEmail = () => {
    clearSavedIdentity()
    setEmail(null)
    // Local favorites remain; server list no longer shown.
    const local = getFavorites()
    setIds(local)
    setListings((prev) => prev.filter((l) => local.includes(l.id)))
  }

  if (loading) return <LoadingState />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Saved For You</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '8px 0 0' }}>♥ Favorites</h1>
        {email ? (
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Saved to <strong style={{ color: '#1a1a2e' }}>{email}</strong> — follows you on any device until the deal is gone.
            {synced && (
              <>
                {' '}
                <Link href="/marketplace/listings" style={{ color: '#c9a84c', fontWeight: 700 }}>Browse more →</Link>
                {' · '}
                <button onClick={forgetEmail} style={{ background: 'transparent', border: 'none', color: '#999', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  disconnect email
                </button>
              </>
            )}
          </p>
        ) : (
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            Saved in this browser. Tap ♥ and add your email to keep favorites on every device.
          </p>
        )}
      </div>

      {ids.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>♡</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No saved listings right now</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Tap the ♥ on any listing to save it here. Saved listings disappear automatically once the deal is sold or removed.{' '}
            <Link href="/marketplace/listings" style={{ color: '#c9a84c', fontWeight: 700 }}>Browse businesses →</Link>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            {listings.length} live saved listing{listings.length !== 1 ? 's' : ''} — sold or removed deals drop off automatically.
          </div>
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
