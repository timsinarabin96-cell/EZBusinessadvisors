import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import CallLog from '@/components/calls/CallLog'

export default function CallsPage() {
  return (
    <AppShell active="Call Log">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <CallLog />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
