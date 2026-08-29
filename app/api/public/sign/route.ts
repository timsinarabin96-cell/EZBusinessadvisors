/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveSigningToken, completeSigning } from '@/lib/documentSigning'
import { renderTemplateBody } from '@/lib/documentBuilder'
import { rateLimitAsync } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const clientIp = (req: Request) =>
  req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
  req.headers.get('x-real-ip') ||
  'unknown'

/**
 * Public signing endpoint — token-gated, accountless.
 *   GET  ?token=…  → document (title + rendered body + party label)
 *   POST { token, name, mode, dataUrl } → records signature; when all
 *        parties have signed, document flips to 'signed'.
 */
export async function GET(req: NextRequest) {
  // Anti-abuse: token lookup is public — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 30, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const token = req.nextUrl.searchParams.get('token') || ''
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 })

  const resolved = await resolveSigningToken(token)
  if (!resolved || !resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved?.error || 'Invalid link' }, { status: 404 })
  }
  const { document, party } = resolved
  const body = renderTemplateBody(document?.body_template || document?.content || '', document?.filled_data || {})

  return NextResponse.json({
    ok: true,
    document: {
      title: document?.title || 'Document',
      body,
      partyLabel: party?.label || 'Signer',
      partyName: party?.name || null,
    },
  })
}

export async function POST(req: NextRequest) {
  // Anti-abuse: public signing endpoint — rate limited per IP.
  if (!(await rateLimitAsync(clientIp(req), { limit: 10, windowMs: 60 * 1000 }))) {
    return NextResponse.json({ ok: false, error: 'Too many requests. Try again later.' }, { status: 429 })
  }
  const body = await req.json().catch(() => ({}))
  const token = String(body.token || '').trim()
  const name = String(body.name || '').trim()
  const mode = body.mode === 'type' ? 'type' : 'draw'
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.slice(0, 500_000) : undefined

  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 })
  if (!name) return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 })

  const res = await completeSigning(token, { name, mode, dataUrl })
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error || 'Signing failed' }, { status: 400 })

  return NextResponse.json({ ok: true, allSigned: res.allSigned, documentId: res.documentId })
}
