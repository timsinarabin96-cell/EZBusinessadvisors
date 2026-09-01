/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { CommissionsPanel } from '@/components/admin/CommissionsPanel'
import { ExpensesPanel } from '@/components/admin/ExpensesPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Finance — one hub for money: commissions & payouts (Commissions) and the
// expense ledger (Expenses). Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'commissions', label: '💰 Commissions', hint: 'Payout pipeline — pending → approved → paid' },
  { key: 'expenses', label: '🧾 Expenses', hint: 'Ledger, categories & vendors' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function FinancePage() {
  const [tab, setTab] = useState<TabKey>('commissions')

  return (
    <AppShell active="Finance">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="💰"
          eyebrow="Finance"
          title="Finance"
          sub="One hub for money — commissions & payouts, plus the expense ledger."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'commissions' && <CommissionsPanel />}
        {tab === 'expenses' && <ExpensesPanel />}
      </div>
    </AppShell>
  )
}
