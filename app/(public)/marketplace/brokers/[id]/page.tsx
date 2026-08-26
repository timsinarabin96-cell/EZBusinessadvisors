/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// Premium public broker profile — the trust-signal showcase.
// Beats BizBuySell's profile with: verified stats (closed deals, transaction
// value, years), services, industries, areas served, languages, credentials,
// CBI proof, team grid, sold-deal history, and a rich contact card.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  fetchPublicBrokerById,
  fetchListingsByBroker,
  fetchPublicBrokers,
  fetchSoldListings,
  PublicBroker,
  PublicMarketplaceListing,
  SoldListing,
} from '@/lib/marketplace'
import PublicListingCard from '@/components/public/PublicListingCard'
import CbiBadge from '@/components/public/CbiBadge'
import LegalDisclaimer from '@/components/public/LegalDisclaimer'
import { LoadingState } from '@/components/ui'

const money = (n: number | null | undefined) => (n != null ? '$' + Number(n).toLocaleString() : '—')

type Tab = 'listings' | 'sold' | 'about'

export default function BrokerProfilePage() {
  const params = useParams()
  const id = params?.id as string
  const [broker, setBroker] = useState<PublicBroker | null>(null)
  const [listings, setListings] = useState<PublicMarketplaceListing[]>([])
  const [sold, setSold] = useState<SoldListing[]>([])
  const [team, setTeam] = useState<PublicBroker[]>([])
  const [tab, setTab] = useState<Tab>('listings')
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const b = await fetchPublicBrokerById(id)
      setBroker(b)
      if (b?.profile_id) {
        setListings(await fetchListingsByBroker(b.profile_id))
      }
      if (b?.agency_id) {
        const all = await fetchPublicBrokers()
        setTeam(all.filter((x) => x.agency_id === b.agency_id && x.id !== b.id))
        setSold(await fetchSoldListings(b.agency_id))
      }
      setLoading(false)
    })()
  }, [id])

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px' }}>
        <LoadingState />
      </div>
    )
  }

  if (!broker) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Broker not found</div>
        <div style={{ marginTop: 16 }}>
          <Link href="/marketplace/brokers" style={{ color: '#c9a84c', fontWeight: 700, textDecoration: 'none' }}>← Back to all brokers</Link>
        </div>
      </div>
    )
  }

  const initials = (broker.public_name || 'B').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const firstName = (broker.public_name || '').split(' ')[0] || 'this broker'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 72px' }}>
      <Link href="/marketplace/brokers" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← All brokers</Link>

      {/* ── HERO ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #2b2b4a 100%)',
        borderRadius: 18, padding: '34px 36px', marginTop: 16,
        color: '#fff', position: 'relative', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(26,26,46,0.25)',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(201,168,76,0.12)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: 120, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        {/* Avatar */}
        <div style={{ width: 128, height: 128, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '4px solid #c9a84c', flexShrink: 0, position: 'relative' }}>
          {broker.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={broker.avatar_url} alt={broker.public_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ color: '#1a1a2e', fontSize: 40, fontWeight: 800, fontFamily: 'Georgia, serif' }}>{initials}</span>
          )}
          {broker.certified && (
            <div style={{ position: 'absolute', bottom: -2, right: -2 }}>
              <CbiBadge />
            </div>
          )}
        </div>

        {/* Name + role */}
        <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, margin: 0, color: '#fff' }}>{broker.public_name}</h1>
            {broker.certified && (
              <span style={{ background: 'rgba(201,168,76,0.2)', border: '1px solid rgba(201,168,76,0.5)', color: '#c9a84c', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase' }}>✓ CBI Certified</span>
            )}
            <span style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase' }}>PREMIUM</span>
          </div>
          <div style={{ fontSize: 15, color: '#c9a84c', fontWeight: 700, marginTop: 5 }}>{broker.title || 'Business Broker'}</div>
          {broker.agency?.name && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>🏢 {broker.agency.name}</div>}

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 28, marginTop: 18, flexWrap: 'wrap' }}>
            <Stat value={String(listings.length)} label="Active listings" />
            <Stat value={String(broker.closed_deals_count || 0)} label="Deals closed" />
            <Stat value={broker.years_experience ? `${broker.years_experience}` : '—'} label="Years experience" />
            <Stat value={money(broker.transaction_value_total)} label="Transaction value" />
          </div>

          {/* Contact actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {broker.email_public && (
              <Link href={`mailto:${broker.email_public}`} style={{ ...cta, background: '#c9a84c', color: '#1a1a2e' }}>✉️ Send Message</Link>
            )}
            {broker.phone && (
              <Link href={`tel:${broker.phone}`} style={{ ...cta, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>📞 Call</Link>
            )}
            {broker.booking_url && (
              <a href={broker.booking_url} target="_blank" rel="noopener noreferrer" style={{ ...cta, background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>📅 Book a Call</a>
            )}
            <button onClick={share} style={{ ...cta, background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
              {copied ? '✓ Copied!' : '⤴ Share Profile'}
            </button>
          </div>
        </div>
      </div>

      {/* ── TABS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginTop: 28, borderBottom: '2px solid var(--line)', paddingBottom: 0 }}>
        {([
          { key: 'listings', label: `For Sale (${listings.length})` },
          { key: 'sold', label: `Sold (${sold.length})` },
          { key: 'about', label: 'About' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '11px 22px', fontSize: 14, fontWeight: 700, fontFamily: 'Georgia, serif', cursor: 'pointer',
              border: 'none', borderBottom: tab === t.key ? '3px solid #c9a84c' : '3px solid transparent',
              background: 'transparent', color: tab === t.key ? '#1a1a2e' : '#888',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: LISTINGS ────────────────────────────────────── */}
      {tab === 'listings' && (
        <div style={{ marginTop: 24 }}>
          {listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: '#888' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>No public listings right now</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>Contact {firstName} directly for off-market opportunities.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {listings.map((l) => <PublicListingCard key={l.id} listing={l} />)}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: SOLD ────────────────────────────────────────── */}
      {tab === 'sold' && (
        <div style={{ marginTop: 24 }}>
          {sold.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: '#888' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>No sold deals published yet</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>Closed transactions appear here as a trust signal for buyers.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {sold.map((s) => (
                <div key={s.listing_id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 22 }}>🏁</span>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 800, color: '#1a1a2e' }}>{s.industry || 'Business'} {s.sub_industry ? `· ${s.sub_industry}` : ''}</div>
                    <div style={{ fontSize: 12.5, color: '#888' }}>{s.location_general || 'Confidential location'}</div>
                  </div>
                  {s.asking_price != null && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#166534' }}>{money(s.asking_price)}</div>
                      {s.multiple != null && <div style={{ fontSize: 12, color: '#888' }}>{s.multiple.toFixed(1)}× SDE</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ABOUT ───────────────────────────────────────── */}
      {tab === 'about' && (
        <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
          {/* Bio */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 26 }}>
            <SectionTitle>About {firstName}</SectionTitle>
            <p style={{ fontSize: 14.5, color: '#555', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0 }}>
              {broker.bio || `${broker.public_name} is an experienced business broker focused on confidential, successful Main Street and lower-middle-market transactions.`}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* Services */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
              <SectionTitle>Services</SectionTitle>
              {broker.expertise.length ? (
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, color: '#555', lineHeight: 2 }}>
                  {broker.expertise.map((e) => <li key={e}>{e}</li>)}
                </ul>
              ) : (
                <p style={{ fontSize: 13.5, color: '#888', margin: 0 }}>Full-service business brokerage, valuations, and M&A advisory.</p>
              )}
            </div>

            {/* Industries */}
            {broker.industries.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
                <SectionTitle>Industries</SectionTitle>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {broker.industries.map((i) => <Chip key={i}>{i}</Chip>)}
                </div>
              </div>
            )}

            {/* Areas served */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
              <SectionTitle>Areas Served</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(broker.service_areas.length ? broker.service_areas : broker.markets).map((a) => <Chip key={a}>📍 {a}</Chip>)}
              </div>
            </div>

            {/* Credentials + languages */}
            <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22 }}>
              <SectionTitle>Credentials</SectionTitle>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {broker.credentials.length ? broker.credentials.map((c) => <Chip key={c}>✓ {c}</Chip>) : <Chip>✓ Licensed Broker</Chip>}
              </div>
              {broker.licensed_states.length > 0 && (
                <>
                  <SectionTitle>Licensed In</SectionTitle>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {broker.licensed_states.map((s) => <Chip key={s}>🔒 {s}</Chip>)}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 8, lineHeight: 1.5 }}>
                    Self-attested {broker.license_attested_at ? `· ${new Date(broker.license_attested_at).toLocaleDateString()}` : ''}. Licensing rules vary by state — see the <a href="/legal/regulations" style={{ color: '#0e7490' }}>state regulations guide</a>.
                  </div>
                </>
              )}
              {broker.languages.length > 0 && (
                <>
                  <SectionTitle>Languages</SectionTitle>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {broker.languages.map((l) => <Chip key={l}>🌐 {l}</Chip>)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM ─────────────────────────────────────────────── */}
      {team.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', marginBottom: 16 }}>
            🤝 Agents at {broker.agency?.name || 'this brokerage'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {team.map((t) => (
              <Link
                key={t.id}
                href={`/marketplace/brokers/${t.id}`}
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, transition: 'box-shadow .15s' }}
              >
                {t.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.avatar_url} alt={t.public_name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c9a84c' }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#1a1a2e', color: '#c9a84c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                    {(t.public_name || 'A').charAt(0)}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{t.public_name}</div>
                  <div style={{ fontSize: 12.5, color: '#888' }}>{t.title || 'Business Broker'}</div>
                  {(t.service_areas.length ? t.service_areas : t.markets).slice(0, 2).map((a) => (
                    <div key={a} style={{ fontSize: 11.5, color: '#c9a84c' }}>📍 {a}</div>
                  ))}
                </div>
                <span style={{ color: '#1a1a2e', fontWeight: 700 }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Legal disclosures — advisory, licensing, non-affiliation */}
      <LegalDisclaimer compact />
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'Georgia, serif', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: '#c9a84c', fontWeight: 700, marginBottom: 12 }}>{children}</div>
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ padding: '6px 12px', borderRadius: 999, background: '#f5f3ec', border: '1px solid #e8e4d6', fontSize: 12.5, fontWeight: 600, color: '#1a1a2e' }}>{children}</span>
}

const cta: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: '10px 18px', borderRadius: 9, fontSize: 13.5, fontWeight: 700,
  textDecoration: 'none', fontFamily: 'Georgia, serif',
}
