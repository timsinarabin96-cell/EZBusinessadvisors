/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect } from 'react'

// The certified-brokers roster lives inside the Training tab now (one tap).
// This route stays alive only so old bookmarks keep working.
export default function CertifiedBrokersRedirectPage() {
  useEffect(() => {
    window.location.replace('/dashboard/training#certificates')
  }, [])
  return (
    <div style={{ padding: 40, color: 'var(--muted)', textAlign: 'center' }}>
      Redirecting to Training…
    </div>
  )
}
