/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import ListingsDashboard from '@/components/listings/ListingsDashboard'

export default function ListingsPage() {
  return (
    <AppShell active="Listings">
      <ListingsDashboard />
    </AppShell>
  )
}
