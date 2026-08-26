/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import Link from 'next/link'

// =============================================================================
// /legal/regulations — state-by-state business brokerage licensing guide.
// Original content written for Concord Deal Platform from public regulatory
// knowledge (IBBA, state real-estate commissions). Educational only — verify
// with the relevant state regulator. Kept as a static page for SEO + trust.
// =============================================================================

const LICENSE_REQUIRED = ['Arizona', 'California', 'Colorado', 'Florida', 'Georgia', 'Idaho', 'Minnesota', 'Nebraska', 'Nevada', 'Rhode Island', 'South Dakota', 'Utah', 'Wisconsin', 'Wyoming']

const REGISTRATION_ONLY = ['Illinois']

const CONDITIONAL = [
  { state: 'Oregon', note: 'License required when real estate transfer is part of the transaction.' },
]

const NO_STATE_LICENSE = [
  { state: 'Alabama', note: 'No specific business-broker license; general business laws apply.' },
  { state: 'Alaska', note: 'No specific business-broker license.' },
  { state: 'Arkansas', note: 'No specific business-broker license.' },
  { state: 'Connecticut', note: 'No specific business-broker license.' },
  { state: 'Delaware', note: 'No specific business-broker license.' },
  { state: 'Hawaii', note: 'No specific business-broker license.' },
  { state: 'Indiana', note: 'No specific business-broker license.' },
  { state: 'Iowa', note: 'No specific business-broker license.' },
  { state: 'Kansas', note: 'No specific business-broker license.' },
  { state: 'Kentucky', note: 'No specific business-broker license.' },
  { state: 'Louisiana', note: 'No specific business-broker license.' },
  { state: 'Maine', note: 'No specific business-broker license.' },
  { state: 'Maryland', note: 'Dual-agency rules apply; no standalone business-broker license.' },
  { state: 'Massachusetts', note: 'No specific business-broker license.' },
  { state: 'Michigan', note: 'No specific business-broker license.' },
  { state: 'Mississippi', note: 'No specific business-broker license.' },
  { state: 'Missouri', note: 'No specific business-broker license.' },
  { state: 'Montana', note: 'No specific business-broker license.' },
  { state: 'New Hampshire', note: 'No specific business-broker license.' },
  { state: 'New Jersey', note: 'No specific business-broker license.' },
  { state: 'New Mexico', note: 'No specific business-broker license.' },
  { state: 'New York', note: 'No specific business-broker license.' },
  { state: 'North Carolina', note: 'No specific business-broker license.' },
  { state: 'North Dakota', note: 'No specific business-broker license.' },
  { state: 'Ohio', note: 'No specific business-broker license.' },
  { state: 'Oklahoma', note: 'No specific business-broker license.' },
  { state: 'Pennsylvania', note: 'No specific business-broker license; general laws apply.' },
  { state: 'South Carolina', note: 'No specific business-broker license.' },
  { state: 'Tennessee', note: 'No specific business-broker license.' },
  { state: 'Texas', note: 'No specific business-broker license.' },
  { state: 'Vermont', note: 'No specific business-broker license.' },
  { state: 'Virginia', note: 'No specific business-broker license.' },
  { state: 'Washington', note: 'No specific business-broker license.' },
  { state: 'West Virginia', note: 'No specific business-broker license.' },
  { state: 'District of Columbia', note: 'No specific business-broker license.' },
]

export const metadata = {
  title: 'Business Brokerage Regulations by State | Concord Deal Platform',
  description: 'State-by-state guide to business brokerage licensing requirements in the United States. Educational reference — confirm with your state regulator.',
}

export default function RegulationsPage() {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '56px 24px' }}>
      <Link href="/legal/terms" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Terms of Service</Link>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 32, color: '#1a1a2e', margin: '14px 0 8px' }}>Business Brokerage Regulations by State</h1>
      <p style={{ color: '#555', fontSize: 14.5, lineHeight: 1.7, maxWidth: 760 }}>
        Licensing requirements for business brokers vary widely across the United States. Some states require a real-estate
        broker license; others require registration; many have no specific license at all. This page is an educational
        reference — <strong>always confirm current requirements with the relevant state regulator</strong> before
        transacting, and consult a licensed attorney in your jurisdiction.
      </p>

      {/* License required */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: '#1a1a2e', margin: '30px 0 12px' }}>🔒 States Requiring a Broker License</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {LICENSE_REQUIRED.map((s) => (
          <div key={s} style={{ padding: '11px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 9, fontSize: 13.5, fontWeight: 700, color: '#991b1b' }}>{s}</div>
        ))}
      </div>

      {/* Registration only */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: '#1a1a2e', margin: '30px 0 12px' }}>📝 Registration-Only States</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {REGISTRATION_ONLY.map((s) => (
          <div key={s} style={{ padding: '11px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>{s}</div>
        ))}
      </div>

      {/* Conditional */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: '#1a1a2e', margin: '30px 0 12px' }}>⚠️ Conditional Requirements</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {CONDITIONAL.map((c) => (
          <div key={c.state} style={{ padding: '13px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, fontSize: 13.5, color: '#555' }}>
            <strong style={{ color: '#92400e' }}>{c.state}:</strong> {c.note}
          </div>
        ))}
      </div>

      {/* No state license */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: '#1a1a2e', margin: '30px 0 12px' }}>✅ No State-Specific Business-Broker License</h2>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px' }}>
        In these states, no standalone business-broker license is required by statute. General business, contract, and
        consumer-protection laws still apply, and federal securities rules may apply to certain transactions.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {NO_STATE_LICENSE.map((s) => (
          <div key={s.state} style={{ padding: '11px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, fontSize: 13, color: '#166534' }}>
            <strong>{s.state}</strong>
            <div style={{ fontSize: 11.5, color: '#555', marginTop: 2 }}>{s.note}</div>
          </div>
        ))}
      </div>

      {/* Other compliance */}
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 21, color: '#1a1a2e', margin: '34px 0 12px' }}>⚖️ Other Compliance Considerations</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {[
          { t: 'Agency & fiduciary duties', d: 'In most states, a signed broker agreement creates an agency relationship with fiduciary obligations (loyalty, confidentiality, disclosure). Some states allow transaction-broker status with no agency duties.' },
          { t: 'Dual agency', d: 'Representing both buyer and seller is regulated state-by-state and may require written consent. Some states allow designated agency within the same brokerage.' },
          { t: 'Securities (SEC)', d: 'Certain M&A transactions may touch securities law. A 2022 federal change exempted many smaller Main Street transactions from broker-dealer registration — but larger or structured deals may still require a securities license.' },
          { t: 'Escrow & settlement', d: 'Sale proceeds are typically held by a settlement attorney or escrow agent who ensures all parties are paid. Bulk-sale notices and UCC filings may be required in some states.' },
          { t: 'Advertising', d: 'Confidential listings must avoid disclosing the seller\u2019s identity without consent. State rules on blind advertising and business-opportunity disclosures vary.' },
        ].map((c) => (
          <div key={c.t} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>{c.t}</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.65, marginTop: 4 }}>{c.d}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 30, padding: '16px 18px', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, fontSize: 12.5, color: '#666', lineHeight: 1.7 }}>
        <strong>⚠️ Important:</strong> This page is general educational information, not legal advice, and requirements change.
        Verify with each state&apos;s real-estate commission or licensing authority and consult a qualified attorney before
        conducting brokerage activity in any state. Concord Deal Platform does not guarantee compliance on behalf of any broker.
      </div>
    </div>
  )
}
