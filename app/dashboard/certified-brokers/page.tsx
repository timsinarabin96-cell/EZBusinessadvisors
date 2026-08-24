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
