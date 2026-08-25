'use client'

// ---------------------------------------------------------------------------
// /dashboard/listings/[id]/edit — Edit a listing in the AI Listing Studio.
// Same auto-saving intelligent form used for new listings; loads the existing
// record into edit mode so there is exactly ONE editor everywhere.
// ---------------------------------------------------------------------------

import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import IntelligentListingForm from '@/components/listings/IntelligentListingForm'
import { useParams } from 'next/navigation'

export default function EditListingPage() {
  const params = useParams()
  const listingId = String(params.id || '')
  return (
    <AppShell active="Listings">
      <ToastProvider>
        <div style={{ maxWidth: 1380, margin: '0 auto' }}>
          <IntelligentListingForm listingId={listingId} />
        </div>
      </ToastProvider>
    </AppShell>
  )
}
