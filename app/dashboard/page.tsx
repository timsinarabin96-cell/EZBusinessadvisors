'use client'

import AppShell from '@/components/layout/AppShell'
import Dashboard from '@/components/dashboard/Dashboard'

export default function DashboardPage() {
  return (
    <AppShell active="Dashboard">
      <Dashboard />
    </AppShell>
  )
}
