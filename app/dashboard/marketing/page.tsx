/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { SocialPanel } from '@/components/marketing/panels/SocialPanel'
import { NewspaperPanel } from '@/components/marketing/panels/NewspaperPanel'
import { BlogPanel } from '@/components/marketing/panels/BlogPanel'
import { NurturePanel } from '@/components/marketing/panels/NurturePanel'
import { SyndicationPanel } from '@/components/marketing/panels/SyndicationPanel'
import { EmailTemplatesPanel } from '@/components/marketing/panels/EmailTemplatesPanel'

// =============================================================================
// Marketing — growth tools hub: social, weekly newspaper, blog, nurture drips,
// syndication, and email templates. (The materials STORE moved to its own
// advanced automated system at /dashboard/store — see lib/store.ts.)
// =============================================================================

const TABS = [
  { key: 'social', label: '📣 Social', hint: 'Post to Facebook / Instagram' },
  { key: 'newspaper', label: '📰 Newspaper', hint: 'Weekly editions & subscribers' },
  { key: 'blog', label: '📝 Blog', hint: 'Articles & insights' },
  { key: 'nurture', label: '💌 Nurture', hint: 'Email drips & sequences' },
  { key: 'syndication', label: '🔗 Syndication', hint: 'Co-brokerage network' },
  { key: 'templates', label: '✉️ Templates', hint: 'Email template library' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function MarketingPage() {
  const [tab, setTab] = useState<TabKey>('social')

  return (
    <AppShell active="Marketing">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 18px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, fontFamily: 'Georgia, serif' }}>Marketing & Growth</h1>
            <p style={{ color: '#888', margin: '4px 0 0', fontSize: 13 }}>
              Social, newspaper, blog, nurture, syndication & templates — order materials in the <a href="/dashboard/store" style={{ color: '#c9a84c', fontWeight: 700 }}>Marketing Store</a>.
            </p>
          </div>
        </div>

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
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{t.hint}</div>
            </button>
          ))}
        </div>

        {tab === 'social' && <SocialPanel />}
        {tab === 'newspaper' && <NewspaperPanel />}
        {tab === 'blog' && <BlogPanel />}
        {tab === 'nurture' && <NurturePanel />}
        {tab === 'syndication' && <SyndicationPanel />}
        {tab === 'templates' && <EmailTemplatesPanel />}
      </div>
    </AppShell>
  )
}
