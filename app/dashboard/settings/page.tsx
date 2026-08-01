'use client'

import AppShell from '@/components/layout/AppShell'
import EmailSettings from '@/components/settings/EmailSettings'
import LicenseSettings from '@/components/settings/LicenseSettings'

export default function SettingsPage() {
  return (
    <AppShell active="Settings">
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 26,
            color: 'var(--navy)', marginBottom: 4,
          }}
        >
          Settings
        </h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Manage your notification, email, and licensing preferences.</p>
        <EmailSettings />
        <div style={{ height: 24 }} />
        <LicenseSettings />
      </div>
    </AppShell>
  )
}
