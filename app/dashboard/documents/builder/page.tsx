/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import DocumentBuilder from '@/components/documents/DocumentBuilder'

export default function DocumentBuilderPage() {
  return (
    <AppShell active="Documents">
      <DocumentBuilder />
    </AppShell>
  )
}
