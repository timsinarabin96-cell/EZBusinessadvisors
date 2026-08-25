import AppShell from '@/components/layout/AppShell'
import DealDataRoom from '@/components/dataRoom/DealDataRoom'
import DataRoomBuyerInterest from '@/components/dataRoom/DataRoomBuyerInterest'

// /dashboard/data-room/[dealId] — full-page Dropbox-style data room for a deal.
export default async function DealDataRoomPage({ params }: { params: { dealId: string } }) {
  return (
    <AppShell active="Deal Pipeline">
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 48px' }}>
        <DealDataRoom dealId={params.dealId} />
        <div style={{ marginTop: 20 }}>
          <DataRoomBuyerInterest dealId={params.dealId} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14, textAlign: 'center' }}>
          Shared with your client portal — buyers &amp; sellers can upload, rename, and delete here too.
        </p>
      </div>
    </AppShell>
  )
}
