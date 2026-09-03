/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'

import PocketListingsClient from '@/components/public/PocketListingsClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pocket Listings — Off-Market Businesses for Sale | Concord Deal Platform',
  description: 'Confidential, off-market business opportunities not listed publicly. Request access through a licensed broker — identity and financials stay private.',
  alternates: { canonical: '/marketplace/pocket' },
  openGraph: { title: 'Pocket Listings — Concord Deal Platform', description: 'Off-market businesses for sale, available by request only.', url: '/marketplace/pocket', type: 'website' },
}

/**
 * /marketplace/pocket — off-market / pocket listings.
 * Broker-flagged opportunities (is_off_market) shown as teasers with a
 * confidential contact form. Never exposes names/addresses.
 */
export default async function PocketListingsPage() {
  const db = createServerClient()
  let teasers: any[] = []
  if (db) {
    const { data } = await db
      .from('public_listings')
      .select('listing_id, public_title, industry, location_general, asking_price, is_off_market')
      .eq('published', true)
      .eq('is_off_market', true)
      .order('published_at', { ascending: false })
      .limit(20)
    teasers = (data || []).filter((t) => t.listing_id)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '56px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🤫</div>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Off-Market Opportunities</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 36, color: '#1a1a2e', margin: '10px 0 12px' }}>Pocket Listings</h1>
        <p style={{ color: '#666', fontSize: 15, maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
          The best businesses rarely hit the open market. These opportunities are available exclusively through our brokers —
          request details and we&apos;ll match you confidentially.
        </p>
      </div>

      <PocketListingsClient teasers={teasers} />
    </div>
  )
}
