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
import { PageHero, PremiumTabs } from '@/components/ui/premium'

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
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="📣"
          eyebrow="Marketing & Growth"
          title="Marketing Command"
          sub="Social, newspaper, blog, nurture, syndication & templates — plus the automated Marketing Store for branded materials."
          actions={<a href="/dashboard/store" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#f0d98c,#c9a84c 55%,#b08d35)', color: '#141a2e', padding: '10px 18px', borderRadius: 12, textDecoration: 'none', fontWeight: 800, fontSize: 13.5, boxShadow: '0 6px 20px rgba(201,168,76,0.4)' }}>🛍️ Marketing Store</a>}
        />
        <PremiumTabs tabs={TABS} active={tab} onChange={setTab} />
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
