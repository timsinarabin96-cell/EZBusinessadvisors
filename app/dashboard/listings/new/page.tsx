import AppShell from '@/components/layout/AppShell'
import IntelligentListingForm from '@/components/listings/IntelligentListingForm'
import { ToastProvider } from '@/components/ui/Toast'

export default function NewListingPage() {
  return (
    <AppShell active="Listings">
      <ToastProvider>
        <div style={{ maxWidth: 1380, margin: '0 auto' }}>
          <IntelligentListingForm />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
