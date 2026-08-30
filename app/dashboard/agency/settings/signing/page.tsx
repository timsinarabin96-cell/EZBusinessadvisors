/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AgencySigningCard from '@/components/agency/AgencySigningCard'

// /dashboard/agency/settings/signing — the agency's NDA auto-sign identity.
export default function AgencySigningPage() {
  return (
    <div style={{ fontFamily: 'Georgia, serif', padding: '4px 0 40px', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, marginBottom: 2 }}>Signing Identity</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Used to auto counter-sign every buyer NDA across your listings.
        </p>
      </div>
      <AgencySigningCard />
    </div>
  )
}
