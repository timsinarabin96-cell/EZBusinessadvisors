/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import AIDealStudio from '@/components/studio/AIDealStudio'

// =============================================================================
// /dashboard/studio — the ONE continuous AI Deal Studio.
// The entire listing lifecycle (Capture → Verify → Go Live → Sell & Close)
// lives in a single canvas with the AI as the conductor. The old separate
// listing-studio and workflow pages route here; Continue never leaves.
// Deep links: ?phase=capture|verify|golive|sell&listing=<id>&step=<n>
// =============================================================================

export default function DealStudioPage() {
  return (
    <AppShell active="Deal Studio">
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 18px 60px' }}>
        <AIDealStudio />
      </div>
    </AppShell>
  )
}
