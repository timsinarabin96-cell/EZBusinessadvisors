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
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          {/* Tab bar */}
          <div className="flex flex-col md:flex-row gap-2 mb-6 bg-white rounded-xl border border-gray-200 p-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 text-left px-4 py-3 rounded-lg transition-colors"
                style={{
                  background: tab === t.key ? '#1a1a2e' : 'transparent',
                  color: tab === t.key ? '#fff' : 'var(--navy)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{t.hint}</div>
              </button>
            ))}
          </div>

          {tab === 'estimate' && <ValuationEngine />}
          {tab === 'comps' && <CompsDb />}
          {tab === 'reports' && <ValuationReportsApp />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
