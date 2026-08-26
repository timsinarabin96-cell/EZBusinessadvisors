/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// BuyerProfilePopup — a business-card / deal-context profile modal for leads.
// Opens over the CRM leads dashboard. Handles BOTH buyer and seller leads:
// buyer_leads and seller_leads have comparable fields (probed live), so the
// same card layout is reused — buyer rows render Deal Context + Search
// Criteria, seller rows render Business + Notes. Any field that is empty is
// simply omitted, and the deal context (deals linked via buyer_lead_id /
// listing_id, plus the listing the lead is tied to) is shown when present.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { UnifiedLead, statusMeta, initials } from '@/lib/leads2'

// --- Shapes (probed live via service role; buyer_leads also carries an
// --- optional avatar_url-style field on some tables, handled defensively)
interface BuyerLeadRow {
  id: string
  listing_id: string | null
  full_name: string | null
  contact_name: string | null
  company: string | null
  email: string | null
  phone: string | null
  budget_range: string | null
  funds_available: number | null
  financing_method: string | null
  offer_amount: number | null
  industries_interest: string | null
  industry_interest: string | null
  desired_business_type: string | null
  preferred_location: string | null
  zip: string | null
  timeframe: string | null
  message: string | null
  notes: string | null
  ai_summary: string | null
  source: string | null
  status: string | null
  created_at: string | null
  agency_id: string | null
  [key: string]: unknown
}

interface SellerLeadRow {
  id: string
  full_name: string | null
  contact_name: string | null
  business_name: string | null
  email: string | null
  phone: string | null
  industry: string | null
  revenue_range: string | null
  timeframe: string | null
  message: string | null
  notes: string | null
  location_general: string | null
  converted_listing_id: string | null
  status: string | null
  created_at: string | null
  [key: string]: unknown
}

interface DealRef {
  id: string
  listing_id: string | null
  status: string | null
  purchase_price: number | null
  expected_close_date: string | null
  title: string | null
}

interface ListingRef {
  id: string
  business_name: string | null
  headline: string | null
  industry: string | null
  location_general: string | null
  asking_price: number | null
}

interface BuyerProfilePopupProps {
  lead: UnifiedLead
  onClose: () => void
}

const fmtUSD = (n?: number | null) =>
  n == null || isNaN(n) ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const clean = (v?: string | null) => (v == null ? '' : String(v).trim())

// Merge possibly-redundant text fields, de-duped, ignoring empties.
const merge = (...vals: (string | null | undefined)[]) =>
  [...new Set(vals.map(clean).filter(Boolean))].join(', ')

export default function BuyerProfilePopup({ lead, onClose }: BuyerProfilePopupProps) {
  const [row, setRow] = useState<BuyerLeadRow | SellerLeadRow | null>(null)
  const [deals, setDeals] = useState<DealRef[]>([])
  const [listing, setListing] = useState<ListingRef | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const isBuyer = lead.kind === 'buyer'
  const b = row as BuyerLeadRow | null
  const s = row as SellerLeadRow | null

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError(false)
      try {
        const table = isBuyer ? 'buyer_leads' : 'seller_leads'
        const { data } = await supabase.from(table).select('*').eq('id', lead.id).maybeSingle()
        if (cancelled) return
        setRow((data as BuyerLeadRow | SellerLeadRow | null) || null)

        // Deal context: deals tied to this lead.
        let linkedListingId: string | null = null
        if (isBuyer) {
          const { data: dls } = await supabase
            .from('deals')
            .select('id, listing_id, status, purchase_price, expected_close_date, title')
            .eq('buyer_lead_id', lead.id)
          if (!cancelled) setDeals((dls as DealRef[]) || [])
          linkedListingId = (data as BuyerLeadRow | null)?.listing_id || null
        } else {
          linkedListingId = (data as SellerLeadRow | null)?.converted_listing_id || null
          if (linkedListingId) {
            const { data: dls } = await supabase
              .from('deals')
              .select('id, listing_id, status, purchase_price, expected_close_date, title')
              .eq('listing_id', linkedListingId)
            if (!cancelled) setDeals((dls as DealRef[]) || [])
          }
        }

        // The listing this lead is attached to (their matched listing).
        if (linkedListingId) {
          const { data: l } = await supabase
            .from('listings')
            .select('id, business_name, headline, industry, location_general, asking_price')
            .eq('id', linkedListingId)
            .maybeSingle()
          if (!cancelled) setListing((l as ListingRef | null) || null)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [lead.id, isBuyer])

  // Close on Escape.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])
  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  // ---- Resolved display values -------------------------------------------
  const status = clean((b?.status || s?.status || lead.status) || 'new')
  const meta = statusMeta(status)

  const name = isBuyer
    ? merge(b?.full_name, b?.contact_name, b?.company, lead.email) || 'Buyer Lead'
    : merge(s?.business_name, s?.full_name, s?.contact_name, lead.email) || 'Seller Lead'
  const company = isBuyer ? clean(b?.company) : clean(s?.business_name)
  const email = clean(b?.email || s?.email || lead.email)
  const phone = clean(b?.phone || s?.phone || lead.phone)
  const created = b?.created_at || s?.created_at || lead.created_at || null
  const avatarUrl = (isBuyer ? (b as BuyerLeadRow)?.avatar_url : (s as SellerLeadRow)?.avatar_url) as string | null | undefined

  const initialsName = (isBuyer ? merge(b?.full_name, b?.company, lead.email) : merge(s?.business_name, s?.full_name, lead.email)) || '?'
  const initialsText = initials(initialsName)

  // Buyer deal-context + criteria rows (only non-empty ones render).
  const dealRows: [string, string | null][] = isBuyer ? [
    ['Budget range', b?.budget_range],
    ['Funds available', fmtUSD(b?.funds_available)],
    ['Financing method', b?.financing_method],
    ['Offer amount', fmtUSD(b?.offer_amount)],
    ['Timeline', b?.timeframe],
    ['Source', b?.source],
  ] : [
    ['Revenue range', s?.revenue_range],
    ['Timeline', s?.timeframe],
  ]

  const criteriaRows: [string, string | null][] = isBuyer ? [
    ['Industries', merge(b?.industries_interest, b?.industry_interest, b?.desired_business_type)],
    ['Preferred location', b?.preferred_location],
    ['ZIP', b?.zip],
  ] : [
    ['Industry', s?.industry],
    ['Location', s?.location_general],
  ]

  const notes = isBuyer
    ? merge(b?.message, b?.notes, b?.ai_summary)
    : merge(s?.message, s?.notes)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.65)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 30px 90px rgba(26,26,46,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — navy card header */}
        <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-3))', color: '#fff', padding: '22px 24px', borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--gold)' }} />
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '2px solid var(--gold)', color: 'var(--gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, fontFamily: 'Georgia, serif', flexShrink: 0 }}>
                  {initialsText}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', fontFamily: 'Georgia, serif', lineHeight: 1.25 }}>
                  {name}
                </div>
                {company && <div style={{ fontSize: 13.5, color: 'var(--gold-light)', marginTop: 2 }}>{company}</div>}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
                  {isBuyer ? '👤 Buyer Lead' : '🏢 Seller Lead'}
                  {created ? ` · added ${new Date(created).toLocaleDateString()}` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close profile"
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>

          {/* Status badge + contact actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <span style={{ background: meta.color, color: '#fff', padding: '3px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
              {meta.label}
            </span>
            {email && (
              <a href={`mailto:${email}`} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
                ✉️ {email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)' }}>
                📞 {phone}
              </a>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--muted)', fontFamily: 'Georgia, serif', fontSize: 14 }}>
              Loading profile…
            </div>
          ) : loadError ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#b91c1c', fontSize: 14 }}>
              Could not load this profile. Close and try again.
            </div>
          ) : (
            <>
              {/* Deal context */}
              {dealRows.some(([, v]) => v) && (
                <Section title={isBuyer ? 'Deal Context' : 'Business'}>
                  {dealRows.filter(([, v]) => v).map(([label, value]) => (
                    <Row key={label} label={label} value={value as string} />
                  ))}
                </Section>
              )}

              {/* Criteria */}
              {criteriaRows.some(([, v]) => v) && (
                <Section title={isBuyer ? 'Search Criteria' : 'Listing Info'}>
                  {criteriaRows.filter(([, v]) => v).map(([label, value]) => (
                    <Row key={label} label={label} value={value as string} />
                  ))}
                </Section>
              )}

              {/* Notes / message */}
              {notes && (
                <Section title="Notes & Message">
                  <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{notes}</div>
                </Section>
              )}

              {/* Deal context — matched listing + linked deals */}
              {(listing || deals.length > 0) && (
                <Section title={isBuyer ? 'Matched Listings & Deals' : 'Deal Status'}>
                  {listing && (
                    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--cream)', marginBottom: deals.length ? 10 : 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        {isBuyer ? 'Interested listing' : 'Converted listing'}
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14.5 }}>
                        {listing.business_name || listing.headline || 'Listing'}
                      </div>
                      {merge(listing.industry, listing.location_general, fmtUSD(listing.asking_price)) && (
                        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                          {merge(listing.industry, listing.location_general, fmtUSD(listing.asking_price))}
                        </div>
                      )}
                    </div>
                  )}
                  {deals.map((d) => (
                    <div key={d.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', background: 'var(--cream)', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Deal {d.id.slice(0, 8)}
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 3 }}>
                            {d.status ? d.status.replace(/_/g, ' ') : 'In pipeline'}
                            {fmtUSD(d.purchase_price) ? ` · ${fmtUSD(d.purchase_price)}` : ''}
                            {d.expected_close_date ? ` · closes ${new Date(d.expected_close_date).toLocaleDateString()}` : ''}
                          </div>
                        </div>
                        <a href="/pipeline" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          Open pipeline →
                        </a>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {!listing && deals.length === 0 && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', border: '2px dashed var(--line)', borderRadius: 10, padding: '14px 10px' }}>
                  No deal yet — use “🎯 Convert to Deal” in the lead drawer to start one.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="section-title" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--navy)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
