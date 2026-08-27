/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { PublicMarketplaceListing } from '@/lib/marketplace'
import { fmt$ } from '@/lib/recast'
import { priceTeaser, PRICING_CTA } from '@/lib/pricingPolicy'
import { listingImageFor } from '@/lib/stockImages'
import { isFavorite, toggleFavorite, isComparing, toggleCompare, getBuyerProfile } from '@/lib/publicFavorites'
import { scoreListingMatch, matchBand, type MatchScoreResult } from '@/lib/matchScore'
import RequestPricingForm from '@/components/public/RequestPricingForm'

export default function PublicListingCard({ listing }: { listing: PublicMarketplaceListing }) {
  const image = listingImageFor(listing.gallery_urls, listing.industry, { title: listing.public_title, price: listing.asking_price ?? undefined, subIndustry: listing.sub_industry })
  const href = `/marketplace/listings/${listing.slug || listing.id}`
  const isNew = listing.published_at ? Date.now() - new Date(listing.published_at).getTime() < 7 * 86400000 : false

  const [fav, setFav] = useState(false)
  const [compare, setCompare] = useState(false)
  const [compareFull, setCompareFull] = useState(false)
  const [match, setMatch] = useState<MatchScoreResult | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setFav(isFavorite(listing.id))
    setCompare(isComparing(listing.id))
    const refreshMatch = () => {
      const profile = getBuyerProfile()
      if (profile.industries.length > 0 || profile.max_price != null || profile.min_sde != null || profile.locations.length > 0) {
        setMatch(scoreListingMatch(listing, profile))
      } else {
        setMatch(null)
      }
    }
    refreshMatch()
    window.addEventListener('concord-match-profile-updated', refreshMatch)
    return () => window.removeEventListener('concord-match-profile-updated', refreshMatch)
  }, [listing.id])

  const onFav = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setFav(toggleFavorite(listing.id))
  }

  const onCompare = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const result = toggleCompare(listing.id)
    setCompare(isComparing(listing.id))
    if (result.full) setCompareFull(true)
  }

  return (
    <div style={{ position: 'relative' }}>
      <Link href={href} style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
        <div style={{ height: 180, background: '#1a1a2e', position: 'relative', overflow: 'hidden' }}>
          {image && !imgError ? (
            <Image src={image} alt={listing.public_title} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} onError={() => setImgError(true)} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: 'rgba(201,168,76,0.55)', fontSize: 40, fontFamily: 'Georgia, serif' }}>{(listing.industry || 'B').slice(0, 1).toUpperCase()}</div>
          )}
          <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(26,26,46,0.85)', color: '#c9a84c', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            {listing.industry || 'Business'}
          </span>
          {listing.is_confidential && (
            <span style={{ position: 'absolute', top: 12, right: 40, background: 'rgba(255,255,255,0.92)', color: '#1a1a2e', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
              Confidential
            </span>
          )}
          {listing.is_featured && (
            <span style={{ position: 'absolute', bottom: 12, left: 12, background: 'linear-gradient(135deg,#c9a84c,#a8872f)', color: '#1a1a2e', padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
              ★ Featured
            </span>
          )}
          {isNew && (
            <span style={{ position: 'absolute', bottom: 12, right: 40, background: 'rgba(16,42,67,0.92)', color: '#fff', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
              NEW
            </span>
          )}
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {listing.listing_ref && <BadgeTone color="#1a1a2e">{listing.listing_ref}</BadgeTone>}
            {(listing.views_7d != null && listing.views_7d > 0) && <BadgeTone color="#e11d48">{listing.views_7d} views this wk</BadgeTone>}
            {listing.vetted && <BadgeTone color="#0e7490">Vetted</BadgeTone>}
            {listing.status === 'active' && <BadgeTone color="#1e7e34">Active</BadgeTone>}
            {listing.status === 'under_contract' && <BadgeTone color="#b45309">Under Contract</BadgeTone>}
            {listing.status === 'sold' && <BadgeTone color="#7b8794">Sold</BadgeTone>}
            {listing.sba_qualified === true && <BadgeTone color="#0e7490">SBA Qualified</BadgeTone>}
            {listing.sba_qualified === false && <BadgeTone color="#64748b">Not SBA</BadgeTone>}
            {listing.seller_financing_available && <BadgeTone color="#0e7490">Financing</BadgeTone>}
            {listing.revenue_verified && <BadgeTone color="#1e7e34">Verified Revenue</BadgeTone>}
            {listing.is_absentee_owner && <BadgeTone color="#15803d">Absentee</BadgeTone>}
            {listing.is_franchise && <BadgeTone color="#7c3aed">Franchise</BadgeTone>}
            {listing.is_relocatable && <BadgeTone color="#b45309">Relocatable</BadgeTone>}
            {listing.employees_full_time != null && <BadgeTone color="#64748b">{listing.employees_full_time} FT</BadgeTone>}
          </div>
          {match && match.hasProfile && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, background: 'linear-gradient(135deg,#fdf9ef,#f7efd8)', border: '1px solid #c9a84c55', borderRadius: 99, padding: '5px 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#8a6d1a' }}>{match.score}%</span>
              <span style={{ fontSize: 12, color: '#8a6d1a', fontWeight: 700 }}>{matchBand(match.score).label}</span>
              <span style={{ fontSize: 11, color: '#a08a4a' }}>for you</span>
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {listing.public_title}
          </div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{listing.location_general || 'Location confidential'}</div>
          {listing.agent_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0ecdf' }}>
              {listing.agent_photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.agent_photo} alt={listing.agent_name} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {listing.agent_name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                </span>
              )}
              <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>{listing.agent_name}</span>
              {listing.agent_title && <span style={{ fontSize: 11, color: '#aaa' }}>· {listing.agent_title}</span>}
            </div>
          )}
          {listing.public_summary && (
            <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {listing.public_summary}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pricing</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
                {PRICING_CTA}
              </div>
              {priceTeaser(listing) && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{priceTeaser(listing)}</div>
              )}
            </div>
            {listing.annual_revenue !== null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Revenue</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{fmt$(listing.annual_revenue)}</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <RequestPricingForm listingId={listing.id} listingTitle={listing.public_title} compact />
          </div>
        </div>
      </Link>

      {/* Floating action buttons (overlay, outside the Link) */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2 }}>
        <button
          onClick={onFav}
          title={fav ? 'Remove from favorites' : 'Save to favorites'}
          style={{ width: 32, height: 32, borderRadius: 99, border: 'none', cursor: 'pointer', background: fav ? '#e11d48' : 'rgba(255,255,255,0.92)', color: fav ? '#fff' : '#1a1a2e', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
        >
          {fav ? '♥' : '♡'}
        </button>
        <button
          onClick={onCompare}
          title={compare ? 'Remove from compare' : 'Add to compare'}
          style={{ width: 32, height: 32, borderRadius: 99, border: 'none', cursor: 'pointer', background: compare ? '#c9a84c' : 'rgba(255,255,255,0.92)', color: compare ? '#1a1a2e' : '#1a1a2e', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
        >
          ⚖
        </button>
      </div>

      {compareFull && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,46,0.06)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
          <div style={{ background: '#1a1a2e', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            Compare up to 3 — open <Link href="/marketplace/compare" style={{ color: '#c9a84c' }}>compare tray</Link>
          </div>
        </div>
      )}
    </div>
  )
}

function BadgeTone({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ background: `${color}14`, color, border: `1px solid ${color}33`, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  )
}
