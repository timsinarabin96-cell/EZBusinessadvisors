'use client'

import AppShell from '@/components/layout/AppShell'
import AgencyAdmin from '@/components/agencies/AgencyAdmin'
import RoleGuard from '@/components/auth/RoleGuard'

export default function AgenciesPage() {
  return (
    <AppShell active="Agency Admin">
      <RoleGuard minAgencyRole="admin">
        <AgencyAdmin />
      </RoleGuard>
    </AppShell>
  )
}
