/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect } from 'react'

// Certificates now live INSIDE the Training tab — one tap, one place.
// This route stays alive only so old links / QR codes keep working.
export default function CertificatesRedirectPage() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')
    const target = code ? `/dashboard/training?code=${encodeURIComponent(code)}#certificates` : '/dashboard/training#certificates'
    window.location.replace(target)
  }, [])
  return (
    <div style={{ padding: 40, color: 'var(--muted)', textAlign: 'center' }}>
      Redirecting to Training…
    </div>
  )
}
