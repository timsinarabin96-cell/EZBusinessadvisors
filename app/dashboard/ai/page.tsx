/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import AICockpit from '@/components/ai/AICockpit'
import { PageHero } from '@/components/ui/premium'

// One AI surface — every tool as a tab, deep-linkable via ?tab=doctor etc.
export default function AIPage() {
  return (
    <AppShell active="AI Autopilot">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <PageHero
            icon="🤖"
            eyebrow="AI Autopilot"
            title="AI Autopilot"
            sub="One AI surface — every tool as a tab, deep-linkable via ?tab=doctor and friends."
          />
          <AICockpit />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
