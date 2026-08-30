import AppShell from '@/components/layout/AppShell'
import OneShotDealBuilder from '@/components/studio/OneShotDealBuilder'

// New listings open in the One-Shot Deal Builder — paste what you know, the
// AI builds the entire deal, then one Approve & Go Live publishes it.
export default function NewListingPage() {
  return (
    <AppShell active="Deal Studio">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 18px 60px' }}>
        <OneShotDealBuilder />
      </div>
    </AppShell>
  )
}
