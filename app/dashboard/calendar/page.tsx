/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import CalendarDashboard from '@/components/calendar/CalendarDashboard'

export default function CalendarPage() {
  return (
    <AppShell active="Calendar">
      <CalendarDashboard />
    </AppShell>
  )
}
