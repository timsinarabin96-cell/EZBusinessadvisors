'use client'

// =============================================================================
// LegalDisclaimer — reusable compliance notice for public surfaces.
// Original boilerplate written for Concord Deal Platform (not copied from any
// third party). Place on broker profiles, listing pages, and marketplace
// pages so every public surface carries clear legal protection:
//   • advisory / not-a-legal-opinion language
//   • state-licensing disclosure
//   • verification disclaimer
//   • non-affiliation statement (not endorsed by any marketplace)
// =============================================================================

import { useState } from 'react'

const FACTS: { label: string; text: string }[] = [
  {
    label: 'Advisory only',
    text: 'All information on this page is provided for general informational purposes only and does not constitute legal, tax, accounting, investment, or financial advice. Nothing here creates an attorney-client, fiduciary, or advisory relationship.',
  },
  {
    label: 'Licensing',
    text: 'Business brokerage and real-estate-license requirements vary by U.S. state and change over time. Each broker is responsible for holding the licenses required in the jurisdictions where they operate. Confirm any broker\u2019s license with your state regulator before engaging them.',
  },
  {
    label: 'Not verified',
    text: 'Broker-provided credentials, experience, transaction counts, and service areas are self-reported and have not been independently verified by Concord Deal Platform unless expressly marked \u201cVerified.\u201d',
  },
  {
    label: 'Non-affiliation',
    text: 'Concord Deal Platform is an independent software and brokerage-services provider. It is not affiliated with, endorsed by, or sponsored by BizBuySell, Transworld, or any other marketplace, and references to industry practices are informational only.',
  },
  {
    label: 'No guarantee',
    text: 'Listings, valuations, sale multiples, and transaction data are provided as-is without warranty of accuracy, completeness, or fitness for a particular purpose. Past transaction data does not predict future results.',
  },
]

export default function LegalDisclaimer({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)

  if (compact) {
    return (
      <div style={{ fontSize: 11, color: '#8a8678', lineHeight: 1.6, marginTop: 16, padding: '12px 14px', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 8 }}>
        <strong>Disclosures:</strong> Advisory information only — not legal, tax, or investment advice. Broker credentials are self-reported unless marked Verified. Licensing requirements vary by state; confirm with your state regulator. Concord Deal Platform is an independent provider, not affiliated with any third-party marketplace. No guarantee of accuracy or results.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 24, border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 18px', border: 'none', background: '#faf9f4', cursor: 'pointer',
          fontSize: 13, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', letterSpacing: '.02em',
        }}
      >
        <span>⚖️ Important Disclosures & Licensing</span>
        <span style={{ fontSize: 12, color: '#888' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '6px 18px 18px', display: 'grid', gap: 14 }}>
          {FACTS.map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{f.label}</div>
              <div style={{ fontSize: 12.5, color: '#555', lineHeight: 1.65 }}>{f.text}</div>
            </div>
          ))}
          <p style={{ fontSize: 11, color: '#999', margin: 0 }}>
            By using this platform you agree to the <a href="/legal/terms" style={{ color: '#0e7490' }}>Terms of Service</a> and{' '}
            <a href="/legal/privacy" style={{ color: '#0e7490' }}>Privacy Policy</a>. Brokerage services are provided by licensed professionals where required by law.
          </p>
        </div>
      )}
    </div>
  )
}
