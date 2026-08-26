/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPublicBrokers, PublicBroker } from '@/lib/marketplace'
import { LoadingState } from '@/components/ui'
import { brokerProfileStrength, strengthColor } from '@/lib/brokerProfileStrength'
import SponsoredSlotInline from '@/components/public/SponsoredSlotInline'

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<PublicBroker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPublicBrokers().then((all) => {
      setBrokers(all)
      setFeatured(all.filter((b) => b.is_featured).slice(0, 6))
    }).finally(() => setLoading(false))
  }, [])

  const [featured, setFeatured] = useState<PublicBroker[]>([])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px' }}>
      <SponsoredSlotInline slotKey="brokers_page_spot" />
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{ color: '#0e7490', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 }}>Advisor Intelligence Network</div>
        <h1 style={{ fontSize: 42, color: '#102a43', margin: '8px 0 12px' }}>Choose expertise, not just a name</h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
          Licensed, experienced business brokerage professionals guiding you through every step of your transaction.
        </p>
      </div>

      {loading ? <LoadingState /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {/* Featured brokers — paid/top-strength slots, Sunbelt-style trust layer */}
          {featured.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 20 }}>⭐</span>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#102a43', margin: 0 }}>Featured Advisors</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
                {featured.map((b) => {
                  const s = brokerProfileStrength(b)
                  return (
                    <div key={b.id} style={{ background: 'linear-gradient(135deg,#0f2038,#153e5c)', borderRadius: 16, padding: 26, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(201,168,76,0.15)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 14, background: '#1a1a2e', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {b.avatar_url ? <img src={b.avatar_url} alt={b.public_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#c9a84c', fontSize: 24, fontWeight: 800 }}>{(b.public_name || 'B').charAt(0)}</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800 }}>{b.public_name}</div>
                          <div style={{ fontSize: 12.5, color: '#c9a84c', fontWeight: 700 }}>{b.title || 'Business Broker'}</div>
                          {b.agency?.name && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{b.agency.name}</div>}
                        </div>
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: strengthColor(s.score) }}>{s.score}/100 strength</span>
                        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{b.years_experience ? `${b.years_experience}+ yrs` : ''}</span>
                      </div>
                      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                        {b.email_public && <a href={`mailto:${b.email_public}`} style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 8, background: '#c9a84c', color: '#102a43', textDecoration: 'none', fontSize: 13, fontWeight: 800 }}>Contact</a>}
                        {b.phone && <a href={`tel:${b.phone.replace(/[^+\d]/g, '')}`} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>📞</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 24 }}>
          {brokers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888', padding: 60, background: '#fff', border: '1px solid #ece8dc', borderRadius: 12 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Broker profiles coming soon</div>
              <div style={{ fontSize: 14, marginTop: 8 }}>Contact us directly to be connected with a dedicated broker.</div>
            </div>
          ) : (
            brokers.map((b) => (
              <div key={b.id} style={{ background: '#fff', border: '1px solid #dce6ef', borderRadius: 16, padding: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
                <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}><div style={{ width: 88, height: 88, flex: '0 0 88px', borderRadius: 18, background: '#102a43', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {b.avatar_url ? (
                    <img src={b.avatar_url} alt={b.public_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#76d7ea', fontSize: 32, fontWeight: 800 }}>{(b.public_name || 'B').charAt(0)}</span>
                  )}
                </div><div><div style={{ fontSize: 20, fontWeight: 800, color: '#102a43' }}>{b.public_name}</div><div style={{ fontSize: 13, color: '#0e7490', fontWeight: 700, marginTop: 4 }}>{b.title || 'Business Broker'}</div>{b.agency?.name && <div style={{ fontSize: 12, color: '#7b8794', marginTop: 2 }}>{b.agency.name}</div>}</div></div>
                {/* Strength badge — trust currency */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '5px 10px', borderRadius: 999, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: strengthColor(brokerProfileStrength(b).score) }}>⚡ {brokerProfileStrength(b).score}/100</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>profile strength</span>
                </div>
                {b.bio && <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6, marginTop: 12 }}>{b.bio}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>{[...b.expertise, ...b.industries].slice(0, 5).map((item) => <span key={item} style={{ padding: '5px 8px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 11.5, fontWeight: 700 }}>{item}</span>)}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}><Metric label="Experience" value={b.years_experience ? `${b.years_experience}+ years` : 'Profile verified'} /><Metric label="Transactions" value={b.closed_deals_count ? `${b.closed_deals_count}+ closed` : 'Confidential'} /></div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {b.email_public && <BrokerLink href={`mailto:${b.email_public}`}>✉️ {b.email_public}</BrokerLink>}
                  {b.phone && <BrokerLink href={`tel:${b.phone}`}>📞 {b.phone}</BrokerLink>}
                  {b.booking_url && <BrokerLink href={b.booking_url}>Book a confidential consultation →</BrokerLink>}
                </div>
              </div>
            ))
          )}
        </div>
        </div>
      )}
    </div>
  )
}

function BrokerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ color: '#102a43', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>{children}</Link>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 10, borderRadius: 9, background: '#f5f8fb' }}><div style={{ fontSize: 10.5, color: '#7b8794', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div><div style={{ fontSize: 12.5, color: '#102a43', fontWeight: 800, marginTop: 3 }}>{value}</div></div>
}
