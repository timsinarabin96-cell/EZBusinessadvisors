/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import AppShell from '@/components/layout/AppShell'
import DealRoom from '@/components/dealRoom/DealRoom'
import DataRoomAccessPanel from '@/components/dataRoom/DataRoomAccessPanel'
import DataRoomBuyerInterest from '@/components/dataRoom/DataRoomBuyerInterest'

// /dashboard/deal-room/[dealId] — the shared Dropbox-style workspace for a deal.
// Agents see everything and manage access levels; buyers/sellers (portal)
// see only what their role allows and can upload/rename/delete within it.
export default async function DealRoomPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params
  return (
    <AppShell active="Deal Room">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 48px' }}>
        <DealRoom dealId={dealId} />
        <div style={{ marginTop: 20 }}>
          <DataRoomAccessPanel dealId={dealId} dealTitle={undefined} />
        </div>
        <div style={{ marginTop: 20 }}>
          <DataRoomBuyerInterest dealId={dealId} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14, textAlign: 'center' }}>
          Shared with your client portal — buyers &amp; sellers upload into the folders they can see. Access levels: 🌐 everyone · 🤝 agent + buyer · 🏠 agent + seller · 🔒 agents only.
        </p>
      </div>
    </AppShell>
  )
}
