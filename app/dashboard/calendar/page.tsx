import AppShell from '@/components/layout/AppShell'
import CalendarDashboard from '@/components/calendar/CalendarDashboard'

export default function CalendarPage() {
  return (
    <AppShell active="Calendar">
      <CalendarDashboard />
    </AppShell>
  )
}
