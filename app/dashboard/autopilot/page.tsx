import AppShell from '@/components/layout/AppShell'
import AutopilotDashboard from '@/components/autopilot/AutopilotDashboard'

export default function AutopilotPage() {
  return (
    <AppShell active="Deal Autopilot">
      <AutopilotDashboard />
    </AppShell>
  )
}
