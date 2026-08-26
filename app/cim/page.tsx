/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { Suspense } from 'react'
import AppShell from '@/components/layout/AppShell'
import CimGenerator from '@/components/cim/CimGenerator'

export default function CimPage() {
  return (
    <AppShell active="CIM Generator">
      <Suspense fallback={<div style={{ padding: 40, color: 'var(--muted)', fontFamily: 'Georgia, serif' }}>Loading CIM Generator...</div>}>
        <CimGenerator />
      </Suspense>
    </AppShell>
  )
}
