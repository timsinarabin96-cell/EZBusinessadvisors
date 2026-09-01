/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { ValuationEngine } from '@/components/valuation/ValuationEnginePanel'
import { CompsDb } from '@/components/valuation/CompsPanel'
import { ValuationReportsApp } from '@/components/valuation/SellableReportsPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Valuation — one hub for pricing a business: quick estimates (Valuation
// Engine), the comparables database (Comps), and client-ready Sellable
// Reports. Previously three separate pages.
// =============================================================================

const TABS = [
  { key: 'estimate', label: '📐 Estimate', hint: 'Quick seller valuation with market multiples' },
  { key: 'comps', label: '📊 Comps', hint: 'Comparables database — sold deals & multiples' },
  { key: 'reports', label: '💎 Sellable Reports', hint: 'Client-ready valuation report orders' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function ValuationPage() {
  const [tab, setTab] = useState<TabKey>('estimate')

  return (
    <AppShell active="Valuation">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="📐"
            eyebrow="Valuation"
            title="Valuation"
            sub="One hub for pricing a business — quick estimates, the comparables database, and client-ready Sellable Reports."
          />
          {/* Tab bar */}
          <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

          {tab === 'estimate' && <ValuationEngine />}
          {tab === 'comps' && <CompsDb />}
          {tab === 'reports' && <ValuationReportsApp />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
