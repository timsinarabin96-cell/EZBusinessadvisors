/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { resolveDocViewUrl } from '@/lib/docViewUrl'

// =============================================================================
// DocOpenLink — a link/button that opens a stored document via the URL
// resolver (public bucket → direct; private financial_docs → signed URL).
// Replaces every raw `href={doc.file_url}` that hit "Bucket not found".
// =============================================================================

export default function DocOpenLink({
  doc,
  children,
  style,
  download,
  className,
  title,
}: {
  doc: { file_url?: string | null; storage_path?: string | null; listing_id?: string | null; deal_id?: string | null; file_name?: string | null }
  children: React.ReactNode
  style?: React.CSSProperties
  download?: boolean
  className?: string
  title?: string
}) {
  const [busy, setBusy] = useState(false)

  const open = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const url = await resolveDocViewUrl(doc)
      if (!url) return
      // Anchor download attribute only works same-origin; signed URLs are
      // cross-origin → force download via fetch+blob when requested.
      if (download) {
        const res = await fetch(url)
        const blob = await res.blob()
        const obj = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = obj
        a.download = doc.file_name || 'document'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(obj)
      } else {
        window.open(url, '_blank', 'noreferrer')
      }
    } catch {
      /* swallow — keep the UI responsive */
    } finally {
      setBusy(false)
    }
  }

  return (
    <a
      href={doc.file_url || '#'}
      onClick={open}
      style={{ cursor: busy ? 'wait' : 'pointer', ...style }}
      className={className}
      title={title}
    >
      {children}
    </a>
  )
}
