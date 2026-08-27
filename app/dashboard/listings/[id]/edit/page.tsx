/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

// =============================================================================
// /dashboard/listings/[id]/edit — legacy route. Everything now lives in the
// AI Deal Studio (Verify phase for existing records). Redirect in-place so
// old bookmarks and links never land on the outdated form.
// =============================================================================

export default function LegacyEditRedirect() {
  const router = useRouter()
  const params = useParams<{ id: string }>()

  useEffect(() => {
    const id = params?.id
    if (id) {
      router.replace(`/dashboard/studio?phase=verify&listing=${encodeURIComponent(id)}`)
    } else {
      router.replace('/dashboard/studio')
    }
  }, [params, router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--muted)', fontSize: 14 }}>
      Opening in the AI Deal Studio…
    </div>
  )
}
