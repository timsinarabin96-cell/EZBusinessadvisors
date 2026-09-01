/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { Suspense, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import CimGenerator from '@/components/cim/CimGenerator'
import BovGenerator from '@/components/bov/BovGenerator'
import RecastStudio from '@/components/recast/RecastStudio'
import DueDiligenceDashboard from '@/components/dueDiligence/DueDiligenceDashboard'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Reports & Diligence — one hub for client deliverables: financial recast,
// CIM, BOV, and the due-diligence checklist. Previously four separate pages.
// =============================================================================

const TABS = [
  { key: 'recast', label: '📊 Recast', hint: 'Adjusted earnings & SDE' },
  { key: 'cim', label: '📑 CIM', hint: 'Confidential information memorandum' },
  { key: 'bov', label: '⚖️ BOV', hint: 'Broker opinion of value' },
  { key: 'diligence', label: '🔍 Due Diligence', hint: 'Checklist & review' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('recast')

  // Honor ?tab=cim|bov|diligence deep links (e.g. from listing cards).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey)
  }, [])

  return (
    <AppShell active="Reports">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="📊"
          eyebrow="Reports & Diligence"
          title="Reports & Diligence"
          sub="One hub for client deliverables — financial recast, CIM, BOV, and the due-diligence checklist."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'recast' && <RecastStudio />}
        {tab === 'cim' && (
          <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading CIM generator…</p>}>
            <CimGenerator />
          </Suspense>
        )}
        {tab === 'bov' && (
          <Suspense fallback={<p style={{ color: 'var(--muted)' }}>Loading BOV generator…</p>}>
            <BovGenerator />
          </Suspense>
        )}
        {tab === 'diligence' && <DueDiligenceDashboard />}
      </div>
    </AppShell>
  )
}
