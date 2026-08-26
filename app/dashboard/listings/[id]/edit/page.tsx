/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// /dashboard/listings/[id]/edit — Edit a listing in the AI Listing Studio.
// Same auto-saving intelligent form used for new listings; loads the existing
// record into edit mode so there is exactly ONE editor everywhere.
// ---------------------------------------------------------------------------

import AppShell from '@/components/layout/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import IntelligentListingForm from '@/components/listings/IntelligentListingForm'
import FeaturedSlotCard from '@/components/listing/FeaturedSlotCard'
import { useParams } from 'next/navigation'

export default function EditListingPage() {
  const params = useParams()
  const listingId = String(params.id || '')
  return (
    <AppShell active="Listings">
      <ToastProvider>
        <div style={{ maxWidth: 1380, margin: '0 auto' }}>
          {/* Studio editor + featured-slot promotion rail */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
            <IntelligentListingForm listingId={listingId} />
            <div style={{ position: 'sticky', top: 16 }}>
              <FeaturedSlotCard listingId={listingId} />
            </div>
          </div>
        </div>
      </ToastProvider>
    </AppShell>
  )
}
