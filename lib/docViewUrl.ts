/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

// =============================================================================
// Document URL resolver — the single source of truth for opening a stored
// financial/generated document.
//
//  * Public bucket URLs (`documents` bucket) → returned as-is (permanent,
//    shareable, works in iframes).
//  * Private bucket objects (`financial_docs` — tax returns, P&L, and any
//    row whose URL points into the private bucket) → resolved to a short-lived
//    SIGNED URL via /api/listings/documents/signed-url at view time. Never
//    stored as a permanent public link.
//
// Fixes the "Bucket not found" (NoSuchBucket) 404 on every generated document
// click: the old code built public URLs for a PRIVATE bucket.
// =============================================================================

const PUBLIC_DOCS_MARKER = '/object/public/documents/'

const urlCache = new Map<string, string>()

export function isPublicDocUrl(fileUrl: string | null | undefined): boolean {
  return Boolean(fileUrl && fileUrl.includes(PUBLIC_DOCS_MARKER))
}

export async function resolveDocViewUrl(doc: {
  file_url?: string | null
  storage_path?: string | null
  listing_id?: string | null
  deal_id?: string | null
}): Promise<string | null> {
  const stored = doc?.file_url || null
  if (!doc) return null
  // Public bucket → permanent URL, use directly.
  if (isPublicDocUrl(stored)) return stored

  // Private bucket → signed URL (cached per storage_path).
  if (doc.storage_path && (doc.listing_id || doc.deal_id)) {
    const key = `${doc.listing_id || doc.deal_id}::${doc.storage_path}`
    if (urlCache.has(key)) return urlCache.get(key) || stored
    try {
      const qs = new URLSearchParams({ path: doc.storage_path })
      if (doc.listing_id) qs.set('listingId', doc.listing_id)
      if (doc.deal_id) qs.set('dealId', doc.deal_id)
      const res = await authenticatedFetch(`/api/listings/documents/signed-url?${qs.toString()}`)
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string }
      if (j.ok && j.url) {
        urlCache.set(key, j.url)
        return j.url
      }
    } catch {
      /* fall through to stored */
    }
  }
  return stored
}

/** React hook — resolves a doc's viewable URL once mounted (with cache). */
export function useDocViewUrl(doc: { file_url?: string | null; storage_path?: string | null; listing_id?: string | null; deal_id?: string | null } | null | undefined) {
  const [url, setUrl] = useState<string | null>(doc?.file_url || null)

  useEffect(() => {
    let alive = true
    if (!doc) {
      setUrl(null)
      return
    }
    resolveDocViewUrl(doc).then((u) => {
      if (alive) setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [doc?.file_url, doc?.storage_path, doc?.listing_id, doc?.deal_id])

  return url
}
