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
import { PageHero, PremiumTabs } from '@/components/ui/premium'

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
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🎯"
          eyebrow="Deals & Listings"
          title="Lead Management"
          sub="Every buyer and seller in one command hub — matches, activity, and outreach from a single screen."
        />
        <PremiumTabs tabs={TABS} active={tab} onChange={setTab} />
        {tab === 'buyers' && <LeadsDashboard />}
        {tab === 'sellers' && <SellerLeadsDashboard />}
      </div>
    </AppShell>
  )
}
