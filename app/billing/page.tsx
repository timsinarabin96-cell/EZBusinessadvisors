/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import BillingDashboard from '@/components/billing/BillingDashboard'
import RoleGuard from '@/components/auth/RoleGuard'

export default function BillingPage() {
  return (
    <AppShell active="Billing">
      <RoleGuard minAgencyRole="admin">
        <Suspense fallback={<div style={{ padding: 40 }}>Loading billing...</div>}>
          <BillingDashboard />
        </Suspense>
      </RoleGuard>
    </AppShell>
  )
}
