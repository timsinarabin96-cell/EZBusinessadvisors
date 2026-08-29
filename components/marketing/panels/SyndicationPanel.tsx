/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import {
  fetchSyndicationInbox, fetchSyndicationOutbox, fetchSyndicationStats,
  offerListing, respondToOffer, withdrawOffer, fetchMyListingsForSyndication,
  type SyndicationOffer, type SyndicationStats,
} from '@/lib/syndication'
import { fetchPublicBrokers, type PublicBroker } from '@/lib/marketplace'
import { useToast } from '@/components/ui/Toast'

const STATUS_COLOR: Record<string, string> = {
  offered: '#0e7490',
  accepted: '#1e7e34',
  declined: '#b00020',
  withdrawn: '#7b8794',
}

const fmt$ = (n: number | null | undefined) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US')

export function SyndicationPanel() {
  const toast = useToast()
  const [inbox, setInbox] = useState<SyndicationOffer[]>([])
  const [outbox, setOutbox] = useState<SyndicationOffer[]>([])
  const [stats, setStats] = useState<SyndicationStats>({ incoming: 0, outgoing: 0, accepted: 0 })
  const [loading, setLoading] = useState(true)
  const [showOffer, setShowOffer] = useState(false)
  const [brokers, setBrokers] = useState<PublicBroker[]>([])
  const [listings, setListings] = useState<Awaited<ReturnType<typeof fetchMyListingsForSyndication>>>([])
  const [offerForm, setOfferForm] = useState({ listingId: '', toProfileId: '', splitPct: '50', note: '' })
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    const [i, o, s, b, l] = await Promise.all([
      fetchSyndicationInbox(), fetchSyndicationOutbox(), fetchSyndicationStats(),
      fetchPublicBrokers(), fetchMyListingsForSyndication(),
    ])
    setInbox(i); setOutbox(o); setStats(s); setBrokers(b); setListings(l); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    const res = await offerListing({
      listingId: offerForm.listingId,
      toProfileId: offerForm.toProfileId || null,
      splitPct: Number(offerForm.splitPct),
      note: offerForm.note || undefined,
    })
    setSending(false)
    if (res.ok) {
      toast('Co-brokerage offer sent — the broker was notified.')
      setShowOffer(false)
      setOfferForm({ listingId: '', toProfileId: '', splitPct: '50', note: '' })
      load()
    } else {
      toast(res.error || 'Could not send offer', 'error')
    }
  }

  const respond = async (offer: SyndicationOffer, action: 'accept' | 'decline') => {
    const res = await respondToOffer(offer.id, action === 'accept' ? 'accepted' : 'declined')
    if (res.ok) { toast(action === 'accept' ? 'Offer accepted — listing is now co-brokered.' : 'Offer declined.'); load() }
    else toast(res.error || 'Action failed', 'error')
  }

  const withdraw = async (offer: SyndicationOffer) => {
    if (!confirm('Withdraw this offer?')) return
    const res = await withdrawOffer(offer.id)
    if (res.ok) { toast('Offer withdrawn.'); load() }
    else toast(res.error || 'Withdraw failed', 'error')
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Co-Brokerage Network</h1>
          <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 620 }}>
            Syndicate your listings to other brokers with a defined split — or accept incoming offers and expand your inventory. Every accepted offer is tracked automatically.
          </p>
        </div>
        <button onClick={() => setShowOffer(true)} disabled={listings.length === 0} style={{
          background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))', color: 'var(--navy)',
          fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, border: 'none',
          padding: '11px 20px', borderRadius: 8, cursor: listings.length === 0 ? 'not-allowed' : 'pointer', opacity: listings.length === 0 ? 0.5 : 1,
        }}>
          + Syndicate a Listing
        </button>
      </div>

      {loading ? <LoadingState /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
            <StatCard label="Incoming offers" value={String(stats.incoming)} accent="#0e7490" />
            <StatCard label="Outgoing offers" value={String(stats.outgoing)} accent="#b45309" />
            <StatCard label="Co-brokered deals" value={String(stats.accepted)} accent="#1e7e34" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
            <Section title={`Incoming (${inbox.length})`} tone="#0e7490">
              {inbox.length === 0 ? <Empty text="No incoming offers yet. When another broker syndicates a deal to you, it appears here." /> : inbox.map((o) => (
                <OfferRow key={o.id} offer={o}>
                  {o.status === 'offered' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => respond(o, 'accept')} style={{ background: '#1e7e34', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Accept</button>
                      <button onClick={() => respond(o, 'decline')} style={{ background: 'none', border: '1px solid rgba(176,0,32,0.35)', color: '#b00020', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Decline</button>
                    </div>
                  )}
                </OfferRow>
              ))}
            </Section>

            <Section title={`Outgoing (${outbox.length})`} tone="#b45309">
              {outbox.length === 0 ? <Empty text="You haven't syndicated any listings yet. Send your best deals to partner brokers to widen buyer coverage." /> : outbox.map((o) => (
                <OfferRow key={o.id} offer={o}>
                  {o.status === 'offered' && (
                    <button onClick={() => withdraw(o)} style={{ marginTop: 12, background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>Withdraw</button>
                  )}
                </OfferRow>
              ))}
            </Section>
          </div>
        </>
      )}

      {showOffer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,26,43,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
          <form onSubmit={send} style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 540, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: 'var(--navy)', margin: 0 }}>Syndicate a Listing</h2>
              <button type="button" onClick={() => setShowOffer(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>

            <Field label="Listing *">
              <select required value={offerForm.listingId} onChange={(e) => setOfferForm({ ...offerForm, listingId: e.target.value })} style={inputStyle}>
                <option value="">— Select listing —</option>
                {listings.map((l) => <option key={l.id} value={l.id}>{l.business_name || l.listing_ref || l.id.slice(0, 8)}{l.asking_price ? ` · ${fmt$(l.asking_price)}` : ''}</option>)}
              </select>
            </Field>
            <Field label="Broker to syndicate to *">
              <select required value={offerForm.toProfileId} onChange={(e) => setOfferForm({ ...offerForm, toProfileId: e.target.value })} style={inputStyle}>
                <option value="">— Select broker —</option>
                {brokers.filter((b) => b.profile_id).map((b) => (
                  <option key={b.id} value={b.profile_id!}>{b.public_name}{b.agency?.name ? ` (${b.agency.name})` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="Their commission split (%) *">
              <input required type="number" min={0} max={100} step={1} value={offerForm.splitPct} onChange={(e) => setOfferForm({ ...offerForm, splitPct: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Note (optional)">
              <textarea value={offerForm.note} onChange={(e) => setOfferForm({ ...offerForm, note: e.target.value })} style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} placeholder="e.g. Seller motivated, strong cash flow, buyer pool ready…" />
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowOffer(false)} style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 8, padding: '11px 20px', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700, fontSize: 14 }}>Cancel</button>
              <button type="submit" disabled={sending} style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '11px 24px', cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>
                {sending ? 'Sending…' : 'Send Offer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function OfferRow({ offer, children }: { offer: SyndicationOffer; children?: React.ReactNode }) {
  const title = offer.listing?.business_name || offer.listing?.listing_ref || 'Confidential listing'
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15 }}>{title}</div>
        <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 9px', borderRadius: 999, background: `${STATUS_COLOR[offer.status]}15`, color: STATUS_COLOR[offer.status], textTransform: 'capitalize' }}>{offer.status}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
        {offer.listing?.industry && <span>{offer.listing.industry} · </span>}
        {offer.listing?.location_general && <span>📍 {offer.listing.location_general} · </span>}
        <span>{fmt$(offer.listing?.asking_price)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
        <b style={{ color: 'var(--navy)' }}>{offer.split_pct}% split</b>
        {' · from '}{offer.from_agency?.name || 'another agency'}{offer.to_agency?.name && offer.status === 'offered' ? ` · to ${offer.to_agency.name}` : ''}
      </div>
      {offer.note && <div style={{ fontSize: 13, color: '#666', fontStyle: 'italic', marginTop: 8 }}>“{offer.note}”</div>}
      {children}
    </div>
  )
}

function Section({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: 14, color: tone, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 12px' }}>{title}</h2>
      {children}
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 26, color: accent, fontWeight: 800, marginTop: 4 }}>{value}</div>
  </div>
}

function Empty({ text }: { text: string }) {
  return <div style={{ background: '#fff', border: '1px dashed var(--line)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>{text}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  border: '1px solid var(--line)', background: '#fff', color: 'var(--text)', fontSize: 14,
  fontFamily: 'Georgia, serif', outline: 'none',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontFamily: 'Georgia, serif', fontWeight: 600, color: 'var(--navy)', fontSize: 13, marginBottom: 4 }}>{label}</label>{children}</div>
}
