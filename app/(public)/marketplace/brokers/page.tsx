'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPublicBrokers, PublicBroker } from '@/lib/marketplace'
import { LoadingState } from '@/components/ui'

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<PublicBroker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPublicBrokers().then(setBrokers).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '60px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div style={{ color: '#0e7490', fontSize: 13, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 }}>Advisor Intelligence Network</div>
        <h1 style={{ fontSize: 42, color: '#102a43', margin: '8px 0 12px' }}>Choose expertise, not just a name</h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
          Licensed, experienced business brokerage professionals guiding you through every step of your transaction.
        </p>
      </div>

      {loading ? <LoadingState /> : (
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
