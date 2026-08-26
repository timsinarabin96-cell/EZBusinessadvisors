/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import Dashboard from '@/components/dashboard/Dashboard'
import TrialBanner from '@/components/agency/TrialBanner'

export default function DashboardPage() {
  return (
    <AppShell active="Dashboard">
      <div style={{ padding: '0 20px', width: '100%', maxWidth: 1200, margin: '0 auto' }}>
        <TrialBanner />
      </div>
      <Dashboard />
    </AppShell>
  )
}
