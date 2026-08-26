/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AppShell from '@/components/layout/AppShell'
import EmailSettings from '@/components/settings/EmailSettings'
import LicenseSettings from '@/components/settings/LicenseSettings'
import TenantSettings from '@/components/settings/TenantSettings'
import PushNotifications from '@/components/settings/PushNotifications'
import AgencyBrandAdmin from '@/components/cards/AgencyBrandAdmin'
import { ToastProvider } from '@/components/ui/Toast'

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <ToastProvider>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1
            style={{
              fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 26,
              color: 'var(--navy)', marginBottom: 4,
            }}
          >
            Settings
          </h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Manage your notification, email, licensing, tenant (domain & API keys), and branding preferences.</p>
          <PushNotifications />
          <div style={{ height: 24 }} />
          <EmailSettings />
          <div style={{ height: 24 }} />
          <TenantSettings />
          <div style={{ height: 24 }} />
          <LicenseSettings />
          <div style={{ height: 24 }} />
          <AgencyBrandAdmin />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
