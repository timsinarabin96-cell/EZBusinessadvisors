/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'
import { ToastProvider } from '@/components/ui/Toast'

export default function AnalyticsPage() {
  return (
    <AppShell active="Analytics">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <AnalyticsDashboard />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
