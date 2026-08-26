/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect } from 'react'

// Root error boundary — branded fallback instead of Next's default stack dump.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log to the console for diagnostics; avoid leaking details to the UI.
    console.error('Concord error boundary:', error)
  }, [error])

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        <div style={{ fontSize: 40 }}>📉</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#fff', margin: '12px 0 6px' }}>Something went sideways</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 24px' }}>
          An unexpected error interrupted the deal flow. Your data is safe — try again, or head back to the marketplace.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={reset} style={{ background: '#c9a84c', color: '#1a1a2e', padding: '12px 24px', borderRadius: 8, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>
            Try again
          </button>
          <a href="/" style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontSize: 13.5 }}>
            Back to Home
          </a>
        </div>
        {error?.digest && <div style={{ marginTop: 18, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Ref {error.digest}</div>}
      </div>
    </div>
  )
}
