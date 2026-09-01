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
import { LoiLab } from '@/components/dealTerms/LoiLab'
import { OfferLab } from '@/components/dealTerms/OfferLab'
import { NegotiationAssistant } from '@/components/dealTerms/NegotiationAssistant'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Deal Terms — one hub for the whole offer workflow: draft the offer (Offer
// Lab), generate the Letter of Intent (LOI Lab), and get AI counter-offer
// strategies (Negotiation). Previously three separate pages.
// =============================================================================

const TABS = [
  { key: 'offers', label: '🧪 Offer Lab', hint: 'Draft offers with instant seller-value scoring' },
  { key: 'loi', label: '📝 LOI Lab', hint: 'One click from accepted offer → professional LOI' },
  { key: 'negotiation', label: '🧭 Negotiation', hint: 'AI counter-offer strategies with BATNA guidance' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function DealTermsPage() {
  const [tab, setTab] = useState<TabKey>('offers')

  return (
    <AppShell active="Deal Terms">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="🤝"
            eyebrow="Deal Terms"
            title="Deal Terms"
            sub="The whole offer workflow in one place — draft, send, negotiate, and close the terms."
          />

          {/* Tab bar */}
          <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

          {tab === 'offers' && <OfferLab />}
          {tab === 'loi' && <LoiLab />}
          {tab === 'negotiation' && <NegotiationAssistant />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
