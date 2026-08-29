/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { NdaPanel } from '@/components/dealdocs/NdaPanel'
import { NdaRequestsPanel } from '@/components/dealdocs/NdaRequestsPanel'
import { ListingAgreementsPanel } from '@/components/dealdocs/ListingAgreementsPanel'

// =============================================================================
// Deal Docs — one hub for the confidentiality & engagement paperwork: NDA
// access requests, signed NDAs, and listing agreements. Previously three
// separate pages.
// =============================================================================

const TABS = [
  { key: 'nda', label: '🤝 NDAs', hint: 'Signed NDAs — approve, countersign, track' },
  { key: 'requests', label: '🛡️ NDA Requests', hint: 'Buyer access requests awaiting review' },
  { key: 'agreements', label: '📋 Listing Agreements', hint: 'Exclusive listing agreement sign-offs' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function DealDocsPage() {
  const [tab, setTab] = useState<TabKey>('nda')

  return (
    <AppShell active="Deal Docs">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 18px 60px' }}>
        {/* Tab bar */}
        <div className="flex flex-col md:flex-row gap-2 mb-4 bg-white rounded-xl border border-gray-200 p-2">
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

        {tab === 'nda' && <NdaPanel />}
        {tab === 'requests' && <NdaRequestsPanel />}
        {tab === 'agreements' && <ListingAgreementsPanel />}
      </div>
    </AppShell>
  )
}
