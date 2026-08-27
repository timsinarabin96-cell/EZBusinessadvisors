/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ---------------------------------------------------------------------------
// GET /api/listing-images/proxy?u=<encoded unsplash url>
// Proxies listing stock photos through our own domain so they always load,
// even when the external image CDN (images.unsplash.com) is slow or blocked
// on the buyer's network. Strictly allow-listed to Unsplash so this can never
// be abused as an open proxy. Responses are CDN-cacheable.
// ---------------------------------------------------------------------------

const ALLOWED_HOSTS = new Set(['images.unsplash.com', 'unsplash.com'])

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return new NextResponse('bad url', { status: 400 })
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return new NextResponse('not allowed', { status: 403 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(u, { signal: controller.signal, cache: 'force-cache' })
    clearTimeout(timer)
    if (!res.ok) return new NextResponse('upstream error', { status: 502 })

    const body = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') || 'image/jpeg'
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('proxy failed', { status: 502 })
  }
}
