/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { authenticateProfileRequest, canAccessProfile, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

export const runtime = 'nodejs'

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function makeKey(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

/**
 * POST /api/certificates/complete
 * body: { brokerId, moduleId, moduleTitle?, brokerName?, brokerEmail? }
 *
 * Auto-issue a certificate when a broker completes all lessons in a module.
 * Reads training_progress to confirm completion, then issues the cert via the
 * service role (idempotent per broker+module) and fires the email.
 */
export async function POST(req: NextRequest) {
  const db = createServerClient()
  if (!db) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()

  const body = await req.json().catch(() => ({}))
  const { brokerId, moduleId, moduleTitle, brokerName, brokerEmail } = body as {
    brokerId?: string
    moduleId?: string
    moduleTitle?: string
    brokerName?: string
    brokerEmail?: string
  }
  if (!brokerId || !moduleId) {
    return NextResponse.json({ ok: false, error: 'brokerId and moduleId are required' }, { status: 400 })
  }
  if (!(await canAccessProfile(authenticated, brokerId))) return forbiddenResponse()

  // Confirm the broker completed every lesson in this module.
  const { data: lessons } = await db
    .from('training_lessons')
    .select('id')
    .eq('module_id', moduleId)

  if (!lessons || lessons.length === 0) {
    return NextResponse.json({ ok: false, error: 'Module has no lessons' }, { status: 400 })
  }

  const { data: progress } = await db
    .from('training_progress')
    .select('lesson_id')
    .eq('broker_id', brokerId)
    .eq('completed', true)

  const completedIds = new Set((progress || []).map((p: any) => p.lesson_id))
  const allDone = lessons.every((l: any) => completedIds.has(l.id))
  if (!allDone) {
    return NextResponse.json(
      { ok: false, error: 'Not all lessons are complete yet.' },
      { status: 409, statusText: 'Conflict' },
    )
  }

  const issuedAt = new Date().toISOString()
  const code = makeCode()
  const key = makeKey({ broker: brokerId, module: moduleId, issued: issuedAt, code })

  const { data: cert, error } = await db
    .from('training_certificates')
    .upsert({
      broker_id: brokerId,
      module_id: moduleId,
      issued_at: issuedAt,
      verification_code: code,
      certificate_key: key,
      template: 'gold',
    }, { onConflict: 'broker_id,module_id' })
    .select('*, training_modules(title)')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Fire-and-forget the certificate email.
  if (brokerEmail) {
    void (async () => {
      try {
        const { notify } = await import('@/lib/email')
        await notify('training_certificate', brokerEmail, {
          brokerName: brokerName || 'you',
          courseTitle: cert.training_modules?.title || moduleTitle || 'a training course',
          certificateId: cert.id,
        })
      } catch { /* email is best-effort */ }
    })()
  }

  // Award module-completion XP server-side (authoritative streak math).
  void (async () => {
    try {
      await fetch(`${req.nextUrl.origin}/api/training/gamification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') || '' },
        body: JSON.stringify({ activity: 'module_certified' }),
      })
    } catch { /* gamification is best-effort */ }
  })()

  return NextResponse.json({
    ok: true,
    certificate: {
      id: cert.id,
      brokerId,
      moduleId,
      issuedAt: cert.issued_at,
      code: cert.verification_code,
      moduleTitle: cert.training_modules?.title || moduleTitle || null,
    },
  })
}
