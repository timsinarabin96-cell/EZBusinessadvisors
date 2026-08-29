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
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <div className="mb-6">
            <h1 className="text-2xl font-bold">🤝 Deal Terms</h1>
            <p className="text-gray-500 text-sm mt-1">
              The whole offer workflow in one place — draft, send, negotiate, and close the terms.
            </p>
          </div>

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

          {tab === 'offers' && <OfferLab />}
          {tab === 'loi' && <LoiLab />}
          {tab === 'negotiation' && <NegotiationAssistant />}
        </div>
      </ToastProvider>
    </AppShell>
  )
}
