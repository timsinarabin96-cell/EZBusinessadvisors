import AppShell from '@/components/layout/AppShell'
import OneShotDealBuilder from '@/components/studio/OneShotDealBuilder'
import { PageHero } from '@/components/ui/premium'

// /dashboard/studio — the ONE-SHOT DEAL BUILDER, the heart of the platform.
// One input (paste notes / drop docs) → Build Entire Deal → AI generates the
// complete, verified, publish-ready deal → Approve & Go Live.
// Deep link: ?listing=<id> opens an existing deal's review screen.
export default function DealStudioPage() {
  return (
    <AppShell active="Deal Studio">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="⚡"
          eyebrow="Deal Studio"
          title="Deal Studio"
          sub="One input (paste notes / drop docs) → Build Entire Deal → AI generates the complete, verified, publish-ready deal → Approve & Go Live."
        />
        <OneShotDealBuilder />
      </div>
    </AppShell>
  )
}
