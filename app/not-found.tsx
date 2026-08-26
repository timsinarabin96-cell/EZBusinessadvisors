/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import Link from 'next/link'

// /not-found — branded 404 for the whole app.
export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 72, fontWeight: 800, color: '#c9a84c', lineHeight: 1 }}>404</div>
        <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', margin: '6px 0 18px' }}>This deal isn&apos;t on the market</div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 26px' }}>
          The page you&apos;re looking for doesn&apos;t exist, was moved, or was never listed. Let&apos;s get you back to the marketplace.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/" style={{ background: '#c9a84c', color: '#1a1a2e', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5 }}>
            ← Back to Home
          </Link>
          <Link href="/marketplace/listings" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5 }}>
            Browse Listings
          </Link>
        </div>
      </div>
    </div>
  )
}
