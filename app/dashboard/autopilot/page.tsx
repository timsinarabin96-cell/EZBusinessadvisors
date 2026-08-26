/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import AutopilotDashboard from '@/components/autopilot/AutopilotDashboard'

export default function AutopilotPage() {
  return (
    <AppShell active="Deal Autopilot">
      <AutopilotDashboard />
    </AppShell>
  )
}
