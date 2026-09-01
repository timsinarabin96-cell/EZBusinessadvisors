/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { SecurityPanel } from '@/components/admin/SecurityPanel'
import { PasswordVaultPanel } from '@/components/admin/PasswordVaultPanel'
import { PageHero, PremiumTabs } from '@/components/ui/premium'

// =============================================================================
// Security — one hub for access & credentials: account security settings and
// the team password vault. Previously two separate pages.
// =============================================================================

const TABS = [
  { key: 'security', label: '🛂 Security', hint: '2FA, sessions & access' },
  { key: 'vault', label: '🔑 Password Vault', hint: 'Shared credentials, encrypted' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function SecurityPage() {
  const [tab, setTab] = useState<TabKey>('security')

  return (
    <AppShell active="Security">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🛂"
          eyebrow="Security"
          title="Security"
          sub="One hub for access & credentials — account security settings and the team password vault."
        />
        {/* Tab bar */}
        <PremiumTabs tabs={[...TABS]} active={tab} onChange={setTab} />

        {tab === 'security' && <SecurityPanel />}
        {tab === 'vault' && <PasswordVaultPanel />}
      </div>
    </AppShell>
  )
}
