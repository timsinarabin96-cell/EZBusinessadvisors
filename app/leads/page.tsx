/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import LeadsDashboard from '@/components/leads/LeadsDashboard'
import SellerLeadsDashboard from '@/components/sellerLeads/SellerLeadsDashboard'

// =============================================================================
// Leads — one hub for both sides of the market: buyers (Lead Management) and
// sellers (Seller Leads). Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'buyers', label: '🎯 Buyers', hint: 'Buyer leads, matches & activity' },
  { key: 'sellers', label: '🏷️ Sellers', hint: 'Seller prospects & outreach' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function LeadsPage() {
  const [tab, setTab] = useState<TabKey>('buyers')

  return (
    <AppShell active="Lead Management">
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

        {tab === 'buyers' && <LeadsDashboard />}
        {tab === 'sellers' && <SellerLeadsDashboard />}
      </div>
    </AppShell>
  )
}
