/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import ListingsDashboard from '@/components/listings/ListingsDashboard'
import { PageHero } from '@/components/ui/premium'

export default function ListingsPage() {
  return (
    <AppShell active="Listings">
      <div style={{ padding: '0 18px 60px', width: '100%', maxWidth: 1200, margin: '0 auto' }}>
        <PageHero
          icon="📌"
          eyebrow="Listings"
          title="Listings"
          sub="Manage your listings — pipeline, status, and the AI Studio workflow."
        />
      </div>
      <ListingsDashboard />
    </AppShell>
  )
}
