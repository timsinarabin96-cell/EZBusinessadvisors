/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import DealIntelligenceDashboard from '@/components/intelligence/DealIntelligenceDashboard'

export default function IntelligencePage() {
  return <AppShell active="Intelligence Network"><DealIntelligenceDashboard /></AppShell>
}
