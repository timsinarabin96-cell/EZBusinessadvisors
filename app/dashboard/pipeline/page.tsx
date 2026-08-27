/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import PipelineDashboard from '@/components/buyers/PipelineDashboard'

// =============================================================================
// /dashboard/pipeline — agency-wide buyer pipeline health.
// Funnel across every listing, conversion rates, heat distribution, and a
// per-listing breakdown — the "deal pulse" scaled to the whole book.
// =============================================================================

export default function PipelinePage() {
  return (
    <AppShell active="Pipeline">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 18px 60px' }}>
        <PipelineDashboard />
      </div>
    </AppShell>
  )
}
