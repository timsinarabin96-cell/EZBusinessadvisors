/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /dashboard/buyer — AI Match Pass portal for buyers.
// Shows pass status, perks, upgrade CTAs, saved searches, bookmarks, and the
// verified-buyer badge. Buyers are NOT agency members — this is a standalone
// product ($49 / $99 per month).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { BUYER_PASS_PLANS, fetchMyBuyerPass, createBuyerPassSession, isBuyerPassActive, buyerPassTier, type BuyerSubscription } from '@/lib/buyerPass'
import { getFavorites } from '@/lib/publicFavorites'
import { fetchSavedSearches } from '@/lib/search'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { Chip, GoldButton, Toggle } from '@/components/ui/premium'

interface BuyerMatch {
  id: string
  match_score: number
  status: string
  matched_on: Record<string, unknown>
  created_at: string
  listings: {
    id: string
    business_name: string | null
    industry: string | null
    sub_industry: string | null
    location_general: string | null
    asking_price: number | null
    annual_revenue: number | null
    sde: number | null
    status: string | null
    cover_image_url: string | null
  } | null
}

interface BuyerProfile {
  id: string
  industries: string[]
  locations: string[]
  min_price: number | null
  max_price: number | null
  min_revenue: number | null
  min_sde: number | null
  notification_email: boolean
  notification_sms: boolean
  ai_match_enabled: boolean
}

// Deal status surfaced to the buyer themselves (audit fix 09-01: the portal
// API existed but no UI consumed it — buyers couldn't see their own pipeline).
interface BuyerDeal {
  buyerListId: string
  pipeline_stage: string | null
  stage_entered_at: string | null
  heat_score: number | null
  nda_signed: boolean
  financial_qualified: boolean
  is_primary_buyer: boolean
  offers_count: number
  listing: {
    id: string
    business_name: string | null
    public_title: string | null
    industry: string | null
    location_general: string | null
    asking_price: number | null
    status: string | null
    image_urls: string[]
  } | null
}

export default function BuyerPortalPage() {
  const toast = useToast()
  const [sub, setSub] = useState<BuyerSubscription | null>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [savedSearches, setSavedSearches] = useState<{ id: string; name: string | null; query: string }[]>([])
  const [matches, setMatches] = useState<BuyerMatch[]>([])
  const [profile, setProfile] = useState<BuyerProfile | null>(null)
  const [deals, setDeals] = useState<BuyerDeal[]>([])
  const [dealsLoaded, setDealsLoaded] = useState(false)
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minSde, setMinSde] = useState('')
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [aiMatch, setAiMatch] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email || '')
      const pass = await fetchMyBuyerPass()
      setSub(pass)
      const { data: profile } = await supabase.from('profiles').select('verified_buyer').eq('id', user.id).maybeSingle()
      setVerified(Boolean(profile?.verified_buyer))
      // Buyer toolkit: favorites + saved searches (best-effort).
      try {
        setFavorites(getFavorites())
        const saved = await fetchSavedSearches()
        setSavedSearches(saved || [])
      } catch { /* degrade */ }
      // Buyer profile + AI matches (auto-provisions the profile on first visit).
      try {
        const [profRes, matchRes] = await Promise.all([
          authenticatedFetch('/api/buyer/profile'),
          authenticatedFetch('/api/buyer/matches'),
        ])
        const prof = await profRes.json()
        if (prof.ok && prof.profile) {
          setProfile(prof.profile)
          setIndustries((prof.profile.industries || []).join(', '))
          setLocations((prof.profile.locations || []).join(', '))
          setMinPrice(prof.profile.min_price != null ? String(prof.profile.min_price) : '')
          setMaxPrice(prof.profile.max_price != null ? String(prof.profile.max_price) : '')
          setMinSde(prof.profile.min_sde != null ? String(prof.profile.min_sde) : '')
          setNotifyEmail(prof.profile.notification_email !== false)
          setAiMatch(prof.profile.ai_match_enabled !== false)
        }
        const mat = await matchRes.json()
        if (mat.ok) setMatches(mat.matches || [])
      } catch { /* degrade */ }
      // Buyer's own deal pipeline (portal API — status they're entitled to see).
      try {
        const dealRes = await authenticatedFetch('/api/buyers/portal')
        const dealJson = await dealRes.json()
        if (dealJson.ok) setDeals(dealJson.deals || [])
      } catch { /* degrade */ } finally {
        setDealsLoaded(true)
      }
    } catch { /* degrade */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
      toast('Match Pass activated — welcome aboard! 🎯', 'success')
      load()
    }
  }, [load, toast])

  const choose = async (planId: string) => {
    setBusy(planId)
    try {
      const url = await createBuyerPassSession(planId)
      if (url) window.location.href = url
    } catch (e: any) {
      toast(e.message || 'Failed to start', 'error')
    } finally {
      setBusy(null)
    }
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const res = await authenticatedFetch('/api/buyer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industries: industries.split(',').map((s) => s.trim()).filter(Boolean),
          locations: locations.split(',').map((s) => s.trim()).filter(Boolean),
          min_price: minPrice ? Number(minPrice) : null,
          max_price: maxPrice ? Number(maxPrice) : null,
          min_sde: minSde ? Number(minSde) : null,
          notification_email: notifyEmail,
          ai_match_enabled: aiMatch,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to save')
      if (json.profile) setProfile(json.profile)
      toast('Match profile saved — we’ll alert you when a business fits. 🎯', 'success')
    } catch (e: any) {
      toast(e.message || 'Failed to save profile', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  if (loading) return <LoadingState label="Loading your Match Pass..." />

  const active = isBuyerPassActive(sub)
  const tier = buyerPassTier(sub)
  const currentPlan = BUYER_PASS_PLANS.find((p) => p.id === tier)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', padding: '40px 20px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>CONCORD</div>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Buyer Match Pass</div>
          </div>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Sign out
          </button>
        </div>

        {/* Status banner */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '26px 28px', marginBottom: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 23, color: '#1a1a2e' }}>
                {active ? `${currentPlan?.icon || '🎯'} ${currentPlan?.name || 'Match Pass'} Active` : '🎯 Match Pass'}
              </h1>
              <p style={{ margin: 0, fontSize: 13.5, color: '#888' }}>
                {email || 'Signed in buyer'}
                {verified && <span style={{ marginLeft: 8, background: '#22c55e1a', color: '#15803d', padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 800 }}>✅ Verified Buyer</span>}
              </p>
            </div>
            {active ? (
              <div style={{ fontSize: 12.5, color: '#666', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '10px 16px' }}>
                {sub?.status === 'trialing' ? 'Trial active' : 'Renews'} {sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : sub?.trial_end ? new Date(sub.trial_end).toLocaleDateString() : '—'}
              </div>
            ) : (
              <Link href="/marketplace/listings" style={{ background: '#1a1a2e', color: '#c9a84c', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5 }}>
                Browse Listings Free →
              </Link>
            )}
          </div>
        </div>

        {/* Perk strip when active */}
        {active && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800, marginBottom: 12 }}>Your Perks</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Perk icon="⚡" label="Priority alerts" sub="Instant email when a match goes live" />
              <Perk icon="🔓" label="Off-market access" sub="Deals not on the public feed" />
              <Perk icon="🧠" label="AI fit-scoring" sub="0–100 match on every listing" />
              <Perk icon="✅" label="Verified badge" sub="Sellers take you seriously" />
            </div>
          </div>
        )}

        {/* Your deals — live pipeline status (audit fix 09-01: was API-only, never rendered) */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800, marginBottom: 4 }}>Your Deals</div>
          <p style={{ fontSize: 12.5, color: '#888', margin: '0 0 14px' }}>
            Where each business stands in your process — from first interest to offer.
          </p>
          {!dealsLoaded ? (
            <p style={{ fontSize: 13, color: '#999' }}>Loading your deals…</p>
          ) : deals.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.6 }}>
              No active deals yet. When you express interest in a listing, your progress (NDA, data room, offer) will show up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deals.map((d) => {
                const l = d.listing
                const stage = d.pipeline_stage || 'new'
                return (
                  <div key={d.buyerListId} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/marketplace/listings/${l?.id || ''}`} style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>
                        {l?.public_title || l?.business_name || 'Business'}
                      </Link>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {[l?.industry, l?.location_general].filter(Boolean).join(' · ')}
                        {l?.asking_price ? ` · $${Number(l.asking_price).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <StagePill stage={stage} />
                      {d.nda_signed ? <Pill color="#15803d" bg="#e6f4ea">✅ NDA signed</Pill> : <Pill color="#b45309" bg="#fdf3e3">📄 NDA pending</Pill>}
                      {d.financial_qualified && <Pill color="#0e7490" bg="#e6f6fa">💰 Financially qualified</Pill>}
                      {d.offers_count > 0 && <Pill color="#7c3aed" bg="#f3e8ff">🤝 {d.offers_count} offer{d.offers_count > 1 ? 's' : ''} submitted</Pill>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Buyer toolkit — saved searches + bookmarks (promised in the header) */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800, marginBottom: 12 }}>Your Toolkit</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e' }}>🔖 Saved searches ({savedSearches.length})</div>
              {savedSearches.length === 0 ? (
                <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>Save a search from the marketplace to get alerts when matches appear.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {savedSearches.slice(0, 5).map((s) => (
                    <Link key={s.id} href="/marketplace/listings" style={{ fontSize: 12.5, color: '#1a1a2e', textDecoration: 'none', fontWeight: 600 }}>
                      {s.name || s.query || 'Saved search'}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e' }}>⭐ Bookmarked listings ({favorites.length})</div>
              <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>
                Your saved businesses from the marketplace — tap the star on any listing to bookmark it.
              </p>
              <Link href="/marketplace/listings" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 700, color: '#c9a84c', textDecoration: 'none' }}>
                {favorites.length > 0 ? 'Browse your bookmarks →' : 'Find businesses to bookmark →'}
              </Link>
            </div>
          </div>
        </div>

        {/* Match profile — what to hunt for (feeds the AI match engine) */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800 }}>Your Match Profile</div>
            {profile && <Chip tone={profile.ai_match_enabled ? 'green' : 'gray'} dot>AI matching {profile.ai_match_enabled ? 'ON' : 'OFF'}</Chip>}
          </div>
          <p style={{ fontSize: 12.5, color: '#888', margin: '4px 0 16px' }}>
            Tell us what you're buying — we'll score every new listing against this and alert you on strong matches.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
              Industries (comma-separated)
              <input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="Restaurants, Home Care, Auto Repair…" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
              Locations (comma-separated)
              <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="New York, FL, Texas…" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
              Min price ($)
              <input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="100000" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
              Max price ($)
              <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="2000000" style={fieldStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
              Min SDE/EBITDA ($)
              <input value={minSde} onChange={(e) => setMinSde(e.target.value)} placeholder="75000" style={fieldStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <Toggle checked={notifyEmail} onChange={setNotifyEmail} label="Email me match alerts" />
            <Toggle checked={aiMatch} onChange={setAiMatch} label="AI matching on" />
          </div>
          <GoldButton onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save match profile'}</GoldButton>
        </div>

        {/* Matches — businesses the engine scored for this buyer */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8a6d1a', fontWeight: 800, marginBottom: 12 }}>Your Matches ({matches.length})</div>
          {matches.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.6 }}>
              No matches yet — the AI engine scores every new listing against your profile above and surfaces strong fits here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {matches.map((m) => {
                const l = m.listings
                const scoreColor = m.match_score >= 70 ? '#15803d' : m.match_score >= 40 ? '#b45309' : '#64748b'
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ minWidth: 52, textAlign: 'center' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{m.match_score}</div>
                      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>fit</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/marketplace/listings/${l?.id || ''}`} style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1a2e', textDecoration: 'none' }}>
                        {l?.business_name || 'Business'}
                      </Link>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {[l?.industry, l?.sub_industry, l?.location_general].filter(Boolean).join(' · ')}
                        {l?.asking_price ? ` · $${Number(l.asking_price).toLocaleString()}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: m.status === 'notified' ? '#15803d' : '#64748b', background: '#fff', border: '1px solid #ece8dc', padding: '4px 10px', borderRadius: 99 }}>
                      {m.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Plans */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {BUYER_PASS_PLANS.map((plan) => {
            const isCurrent = sub?.tier === plan.id && active
            return (
              <div key={plan.id} style={{ background: '#fff', borderRadius: 14, border: plan.highlighted ? '2px solid #c9a84c' : '1px solid #ece8dc', boxShadow: plan.highlighted ? '0 8px 40px rgba(201,168,76,0.25)' : '0 2px 12px rgba(26,26,46,0.06)', padding: '26px 24px', display: 'flex', flexDirection: 'column' }}>
                {plan.highlighted && <div style={{ background: 'linear-gradient(90deg,#c9a84c,#e6ce8c)', color: '#1a1a2e', textAlign: 'center', padding: '5px', fontSize: 11.5, fontWeight: 800, letterSpacing: 1, borderRadius: 6, marginBottom: 12 }}>MOST POPULAR</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{plan.icon}</span>
                  <span style={{ fontSize: 19, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{plan.name}</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 5 }}>{plan.tagline}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>${plan.monthly}</span>
                  <span style={{ color: '#888', fontSize: 14 }}>/ month</span>
                </div>
                <ul style={{ flex: 1, padding: '16px 0 0', margin: 0, listStyle: 'none' }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ padding: '6px 0', fontSize: 13.5, color: '#555', display: 'flex', gap: 8 }}>
                      <span style={{ color: '#c9a84c' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => choose(plan.id)} disabled={busy === plan.id || isCurrent} style={{ marginTop: 18, width: '100%', padding: '13px', borderRadius: 8, cursor: isCurrent ? 'default' : 'pointer', background: isCurrent ? '#f0ecdf' : plan.highlighted ? '#1a1a2e' : '#fff', color: isCurrent ? '#888' : plan.highlighted ? '#c9a84c' : '#1a1a2e', border: isCurrent ? 'none' : plan.highlighted ? 'none' : '2px solid #1a1a2e', fontWeight: 800, fontFamily: 'Georgia, serif' }}>
                  {busy === plan.id ? 'Redirecting…' : isCurrent ? 'Current Plan' : plan.cta}
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 22, fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>
          14-day free trial on every plan. Cancel anytime.
        </div>
      </div>
    </div>
  )
}

function Perk({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1a1a2e', marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  new: '🆕 New',
  contacted: '📞 Contacted',
  nda_sent: '📄 NDA sent',
  nda_signed: '✅ NDA signed',
  qualified: '💰 Qualified',
  data_room: '📁 Data room',
  loi: '📝 LOI',
  negotiation: '🤝 Negotiating',
  closed: '🎉 Closed',
  lost: '✖️ Closed (lost)',
}

function StagePill({ stage }: { stage: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: '#1a1a2e', background: '#fff', border: '1px solid #d8d2c0', padding: '4px 10px', borderRadius: 99 }}>
      {STAGE_LABELS[stage] || stage.replace(/_/g, ' ')}
    </span>
  )
}

function Pill({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '4px 10px', borderRadius: 99 }}>
      {children}
    </span>
  )
}

const fieldStyle: React.CSSProperties = {
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid #e2dccb',
  background: '#fff',
  fontSize: 13,
  color: '#1a1a2e',
  outline: 'none',
}
