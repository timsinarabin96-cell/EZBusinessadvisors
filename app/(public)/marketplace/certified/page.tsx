'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState } from '@/components/ui'

interface CertifiedBroker {
  broker_id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  modules_certified: number
  last_certified_at: string | null
}

// Public Certified Business Intermediaries directory — proof that our brokers
// complete the full CBI training program (14 modules) before they represent
// buyers and sellers.
export default function CertifiedBrokersPage() {
  const [brokers, setBrokers] = useState<CertifiedBroker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/certified-brokers')
      .then((r) => r.json())
      .then((json) => setBrokers(json.brokers || []))
      .catch(() => setBrokers([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{ color: '#0e7490', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 }}>
          CBI Certification Program
        </div>
        <h1 style={{ fontSize: 42, color: '#102a43', margin: '8px 0 12px' }}>Certified Business Intermediaries</h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          Every broker on this roster has completed the full 14-module CBI training program — valuation science, financial
          recasting, confidentiality, deal structuring, SBA financing, negotiation, ethics, brand awareness, and closing — and earned a verifiable
          course-completion certificate.
        </p>
        <div style={{ marginTop: 18, display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ padding: '6px 14px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>🎓 14 modules</span>
          <span style={{ padding: '6px 14px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>🔎 Verifiable certificates</span>
          <span style={{ padding: '6px 14px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>🤝 NDA-first process</span>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading certified brokers..." />
      ) : brokers.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 60, background: '#fff', border: '1px solid #ece8dc', borderRadius: 12 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎖️</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Certified brokers appear here</div>
          <div style={{ fontSize: 14, marginTop: 8, maxWidth: 460, margin: '8px auto 0' }}>
            Brokers earn their CBI certificate by completing all 12 training modules. Check back soon — or contact us to be
            connected with a certified intermediary.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
          {brokers.map((b) => (
            <div key={b.broker_id} style={{ background: '#fff', border: '1px solid #dce6ef', borderRadius: 16, padding: 26, boxShadow: '0 10px 35px rgba(16,42,67,0.07)' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 72, height: 72, flex: '0 0 72px', borderRadius: '50%', background: 'linear-gradient(135deg,#0f2038,#14294f)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {b.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.avatar_url} alt={b.full_name || 'broker'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#c9a84c', fontSize: 26, fontWeight: 800 }}>{(b.full_name || '?').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 800, color: '#102a43' }}>{b.full_name || 'Certified Intermediary'}</div>
                  <div style={{ fontSize: 12, color: '#0e7490', fontWeight: 700, marginTop: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    🏆 CBI Certified
                  </div>
                  <div style={{ fontSize: 12, color: '#7b8794', marginTop: 2 }}>
                    {b.modules_certified} module{b.modules_certified === 1 ? '' : 's'} certified
                  </div>
                </div>
              </div>
              <div style={{ height: 1, background: '#eef2f6', margin: '16px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12.5, color: '#7b8794' }}>
                  {b.last_certified_at
                    ? `Certified ${new Date(b.last_certified_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                    : 'Verified training record'}
                </div>
                <span style={{ padding: '4px 10px', background: '#fdf6e3', color: '#8a6d1a', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid #e8d9a8' }}>
                  ✓ Record verified
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ marginTop: 48, background: '#071827', color: '#fff', borderRadius: 16, padding: '36px 40px', textAlign: 'center' }}>
        <h2 style={{ color: '#fff', fontSize: 26, margin: '0 0 8px' }}>Ready to work with a certified intermediary?</h2>
        <p style={{ color: '#cbdbe7', fontSize: 14.5, maxWidth: 520, margin: '0 auto 20px' }}>
          Browse confidential listings, or talk to a broker about selling your business.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/marketplace/listings" style={{ background: '#0e7490', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Browse businesses for sale
          </Link>
          <Link href="/marketplace/sell" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Get a free valuation
          </Link>
          <Link href="/verify" style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#fff', padding: '12px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
            Verify a certificate
          </Link>
        </div>
      </div>
    </div>
  )
}
