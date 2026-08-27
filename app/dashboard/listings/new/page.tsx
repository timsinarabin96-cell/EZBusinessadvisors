import AppShell from '@/components/layout/AppShell'
import AIDealStudio from '@/components/studio/AIDealStudio'

// New listings open inside the AI Deal Studio (Capture phase) — one continuous
// canvas from here through Verify → Go Live → Sell & Close.
export default function NewListingPage() {
  return (
    <AppShell active="Deal Studio">
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 18px 60px' }}>
        <AIDealStudio />
      </div>
    </AppShell>
  )
}
