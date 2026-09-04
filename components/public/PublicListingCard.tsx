/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PublicMarketplaceListing } from '@/lib/marketplace'
import { fmt$ } from '@/lib/recast'
import { priceTeaser, PRICING_CTA } from '@/lib/pricingPolicy'
import { listingImageFor } from '@/lib/stockImages'
import { isFavorite, toggleFavorite, isComparing, toggleCompare, getBuyerProfile, getSavedEmail, setSavedIdentity, syncSavedListing } from '@/lib/publicFavorites'
import { scoreListingMatch, matchBand, type MatchScoreResult } from '@/lib/matchScore'
import RequestPricingForm from '@/components/public/RequestPricingForm'

export default function PublicListingCard({ listing }: { listing: PublicMarketplaceListing }) {
  const image = listingImageFor(listing.gallery_urls, listing.industry, { title: listing.public_title, price: listing.asking_price ?? undefined, subIndustry: listing.sub_industry })
  const href = `/marketplace/listings/${listing.slug || listing.id}`
  const isNew = listing.published_at ? Date.now() - new Date(listing.published_at).getTime() < 7 * 86400000 : false

  const [fav, setFav] = useState(false)
  const [compare, setCompare] = useState(false)
  const [compareFull, setCompareFull] = useState(false)
  const [showEmailPrompt, setShowEmailPrompt] = useState(false)
  const [emailPromptValue, setEmailPromptValue] = useState('')
  const [emailPromptBusy, setEmailPromptBusy] = useState(false)
  const [emailPromptError, setEmailPromptError] = useState('')
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
    if (fav) {
      // Unsave: drop locally + server (when email identity known).
      toggleFavorite(listing.id)
      setFav(false)
      if (getSavedEmail()) void syncSavedListing(listing.id, false)
      return
    }
    if (!getSavedEmail()) {
      // First save → capture email so the list follows the buyer.
      setShowEmailPrompt(true)
      return
    }
    toggleFavorite(listing.id)
    setFav(true)
    void syncSavedListing(listing.id, true)
  }

  const submitEmailSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const email = emailPromptValue.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailPromptError('Enter a valid email so your saved list follows you.')
      return
    }
    setEmailPromptBusy(true)
    setEmailPromptError('')
    try {
      const res = await fetch('/api/public/saved-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, listingId: listing.id, action: 'add' }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) {
        setEmailPromptError(data.error || 'Could not save — try again.')
        return
      }
      setSavedIdentity(data.email, data.token)
      toggleFavorite(listing.id)
      setFav(true)
      setShowEmailPrompt(false)
      setEmailPromptValue('')
    } catch {
      setEmailPromptError('Could not save — try again.')
    } finally {
      setEmailPromptBusy(false)
    }
  }

  const saveLocallyOnly = () => {
    toggleFavorite(listing.id)
    setFav(true)
    setShowEmailPrompt(false)
    setEmailPromptValue('')
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
      <Link href={href} className="lift" style={{ display: 'block', minWidth: 0, textDecoration: 'none', background: '#fff', border: '1px solid #ece8dc', borderRadius: 18, overflow: 'hidden', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
        <div style={{ height: 200, background: '#1a1a2e', position: 'relative', overflow: 'hidden' }}>
          {image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={listing.public_title} onError={() => setImgError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: 'rgba(201,168,76,0.55)', fontSize: 40, fontFamily: 'Georgia, serif' }}>{(listing.industry || 'B').slice(0, 1).toUpperCase()}</div>
          )}
          <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(10,14,28,0.78)', backdropFilter: 'blur(8px)', color: '#f0d98c', padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{industryEmojiFor(listing.industry)}</span>{listing.industry || 'Business'}
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
            {listing.trust_label === 'AI-Verified Financials' && <BadgeTone color="#1e7e34">🤖 AI-Verified Financials</BadgeTone>}
            {listing.trust_label === 'AI-Vetted' && <BadgeTone color="#1e7e34">🛡️ AI-Vetted</BadgeTone>}
            {listing.trust_label === 'Self-Reported' && <BadgeTone color="#64748b">📋 Self-Reported</BadgeTone>}
            {listing.seller_verified && <BadgeTone color="#0e7490">🛡️ Identity Verified</BadgeTone>}
            {listing.bov_on_file && <BadgeTone color="#7c3aed">📊 BOV on file</BadgeTone>}
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
          {/* Financial highlights — the buyer hook: revenue, SDE/EBITDA, est. year */}
          {(listing.annual_revenue != null || listing.sde != null || listing.ebitda != null || listing.established_year != null) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {listing.annual_revenue != null && (
                <span style={{ background: '#f4f1e8', border: '1px solid #ece8dc', borderRadius: 6, padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: '#1a1a2e' }}>
                  💰 Rev {fmt$(listing.annual_revenue)}
                </span>
              )}
              {listing.sde != null && (
                <span style={{ background: '#fdf6ec', border: '1px solid #f0dfc2', borderRadius: 6, padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: '#8a6d1a' }}>
                  📈 SDE {fmt$(listing.sde)}
                </span>
              )}
              {listing.ebitda != null && (
                <span style={{ background: '#eef7f1', border: '1px solid #d5eade', borderRadius: 6, padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: '#1e7e34' }}>
                  📊 EBITDA {fmt$(listing.ebitda)}
                </span>
              )}
              {listing.established_year != null && (
                <span style={{ background: '#eef2f9', border: '1px solid #dbe4f2', borderRadius: 6, padding: '4px 9px', fontSize: 11.5, fontWeight: 700, color: '#1d4ed8' }}>
                  🏢 Est. {listing.established_year}
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>{listing.is_franchise ? 'Total Investment' : 'Asking Price'}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>
                {listing.asking_price != null ? fmt$(listing.asking_price) : listing.is_franchise && (listing.total_investment_min != null || listing.total_investment_max != null)
                  ? investmentRangeLabel(listing)
                  : PRICING_CTA}
              </div>
              {priceTeaser(listing) && listing.asking_price == null && !listing.is_franchise && (
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{priceTeaser(listing)}</div>
              )}
              {listing.is_franchise === true && (listing.brand_name || listing.franchise_fee != null || listing.royalty_fee_pct != null || listing.territories_available) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {listing.brand_name && <InclusionChip tone="#7c3aed">🏷️ {listing.brand_name}</InclusionChip>}
                  {listing.franchise_fee != null && <InclusionChip tone="#b45309">Fee {fmt$(listing.franchise_fee)}</InclusionChip>}
                  {listing.royalty_fee_pct != null && <InclusionChip tone="#1e7e34">Royalty {listing.royalty_fee_pct}%</InclusionChip>}
                  {listing.territories_available && <InclusionChip tone="#1d4ed8">📍 {listing.territories_available}</InclusionChip>}
                </div>
              )}
              {(listing.is_franchise !== true && (listing.inventory_included != null || listing.real_estate_included != null || listing.asset_sale != null)) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {listing.asset_sale === false && <InclusionChip tone="#b45309">Asset sale only</InclusionChip>}
                  {listing.inventory_included === true && <InclusionChip tone="#1e7e34">📦 Inventory incl.</InclusionChip>}
                  {listing.inventory_included === false && <InclusionChip tone="#64748b">No inventory</InclusionChip>}
                  {listing.real_estate_included === true && <InclusionChip tone="#1d4ed8">🏢 Property incl.</InclusionChip>}
                  {listing.real_estate_included === false && <InclusionChip tone="#64748b">No property</InclusionChip>}
                </div>
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

      {showEmailPrompt && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(26,26,46,0.35)', borderRadius: 18 }}>
          <form
            onSubmit={submitEmailSave}
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 18, margin: 14, width: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', border: '1px solid #ece8dc' }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>♥ Save this listing</div>
            <div style={{ fontSize: 12, color: '#888', margin: '6px 0 10px', lineHeight: 1.5 }}>
              Enter your email and it stays saved on any device until the deal is gone.
            </div>
            <input
              type="email"
              autoFocus
              value={emailPromptValue}
              onChange={(e) => setEmailPromptValue(e.target.value)}
              placeholder="you@email.com"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 14 }}
            />
            {emailPromptError && <div style={{ fontSize: 12, color: '#e11d48', marginTop: 6 }}>{emailPromptError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="submit"
                disabled={emailPromptBusy}
                style={{ flex: 1, background: 'linear-gradient(135deg,#c9a84c,#a8872f)', color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '10px 0', fontWeight: 800, cursor: emailPromptBusy ? 'wait' : 'pointer', fontSize: 13 }}
              >
                {emailPromptBusy ? 'Saving…' : 'Save with email'}
              </button>
            </div>
            <button
              type="button"
              onClick={saveLocallyOnly}
              style={{ marginTop: 8, width: '100%', background: 'transparent', border: 'none', color: '#999', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Save on this device only
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function industryEmojiFor(industry: string | null | undefined): string {
  const t = (industry || '').toLowerCase()
  if (/(restaurant|food|diner|cafe|bar|pizza|bakery)/.test(t)) return '🍽️'
  if (/(hvac|plumb|electric|contractor|roof|construction)/.test(t)) return '🔧'
  if (/(salon|barber|beauty|spa|nail|cosmetic)/.test(t)) return '💇'
  if (/(auto|car|truck|repair|mechanic|dealership)/.test(t)) return '🚗'
  if (/(health|medical|dental|clinic|pharma|home care)/.test(t)) return '🩺'
  if (/(laundromat|laundry|clean)/.test(t)) return '🧺'
  if (/(storage|warehouse)/.test(t)) return '📦'
  if (/(e-?commerce|online|amazon|shopify)/.test(t)) return '🛒'
  if (/(software|tech|it|app|web|saas)/.test(t)) return '💻'
  if (/(gym|fitness|yoga|training)/.test(t)) return '🏋️'
  if (/(pet|grooming|veterinar)/.test(t)) return '🐾'
  if (/(childcare|daycare|preschool)/.test(t)) return '🧸'
  if (/(retail|store|shop|convenience|gas)/.test(t)) return '🛍️'
  if (/(manufactur|industrial|factory)/.test(t)) return '🏭'
  if (/(logistics|truck|freight|delivery|transport)/.test(t)) return '🚚'
  if (/(car wash|detail)/.test(t)) return '🚿'
  return '🏢'
}

function BadgeTone({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ background: `${color}14`, color, border: `1px solid ${color}33`, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  )
}

function InclusionChip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span style={{ background: `${tone}12`, color: tone, border: `1px solid ${tone}30`, padding: '3px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  )
}

/** Franchise opportunities list a total-investment range instead of an asking price. */
function investmentRangeLabel(listing: { total_investment_min?: number | null; total_investment_max?: number | null }): string {
  const { total_investment_min: min, total_investment_max: max } = listing
  if (min != null && max != null && min !== max) return `${fmt$(min)} – ${fmt$(max)}`
  if (min != null) return `From ${fmt$(min)}`
  if (max != null) return `Up to ${fmt$(max)}`
  return 'Investment on application'
}
