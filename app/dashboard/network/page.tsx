/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ProfessionalsPanel } from '@/components/network/ProfessionalsPanel'
import { ReferralsPanel } from '@/components/network/ReferralsPanel'
import { LeadMarketplacePanel } from '@/components/network/LeadMarketplacePanel'

// =============================================================================
// Network — one hub for your professional ecosystem: the vetted professional
// directory (lawyers, CPAs, lenders), the referral program, and the lead
// marketplace. Previously three separate pages.
// =============================================================================

const TABS = [
  { key: 'professionals', label: '🤝 Professionals', hint: 'Lawyers, CPAs, lenders & consultants' },
  { key: 'referrals', label: '🎁 Referrals', hint: 'Referral program & rewards' },
  { key: 'marketplace', label: '💼 Lead Marketplace', hint: 'Buy & sell leads' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function NetworkPage() {
  const [tab, setTab] = useState<TabKey>('professionals')

  return (
    <AppShell active="Network">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 18px 60px' }}>
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

        {tab === 'professionals' && <ProfessionalsPanel />}
        {tab === 'referrals' && <ReferralsPanel />}
        {tab === 'marketplace' && <LeadMarketplacePanel />}
      </div>
    </AppShell>
  )
}
