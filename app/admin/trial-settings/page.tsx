/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import AdminTrialSettings from '@/components/agency/AdminTrialSettings'

// /admin/trial-settings — admin global + per-agency trial configuration.
// Super-admin only; wrap with an admin gate in production.
export default function AdminTrialSettingsPage() {
  return <AdminTrialSettings />
}
