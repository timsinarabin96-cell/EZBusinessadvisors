/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// PrintFlyerButton — client island for the flyer page's "Print / Save PDF"
// action. The flyer page is a server component, so onClick handlers must live
// in a small client component like this one.
// =============================================================================

export default function PrintFlyerButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{ padding: '9px 18px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
    >
      🖨️ Print / Save PDF
    </button>
  )
}
