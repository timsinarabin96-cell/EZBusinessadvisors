import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateProfileRequest, canAccessProfile, forbiddenResponse, unauthorizedResponse } from '@/lib/supabase/auth'

// ---------------------------------------------------------------------------
// Certificate API — generate/issue a certificate record + public verification.
// Runs server-side only (certificate writes + emails use the service role).
// Never exposes the service key to the browser.
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SVC = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || 'NO_KEY', {
      auth: { persistSession: false },
    })
  : null

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app'

function makeCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function makeKey(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

// GET /api/certificates/verify?code=XXXX — public verification of a cert code.
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase()
  const key = (req.nextUrl.searchParams.get('key') || '').trim()
  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  try {
    let matches
    if (key) {
      // Direct base64 payload lookup (from the QR code).
      let payload: any = null
      try { payload = JSON.parse(Buffer.from(key, 'base64').toString('utf8')) } catch { /* ignore */ }
      if (!payload || !payload.code) return NextResponse.json({ ok: false, reason: 'Invalid certificate key.' }, { status: 404 })
      matches = await svc
        .from('training_certificates')
        .select('*, profiles(full_name, email), training_modules(title)')
        .eq('verification_code', payload.code)
        .maybeSingle()
    } else {
      if (!code) return NextResponse.json({ ok: false, error: 'missing code' }, { status: 400 })
      matches = await svc
        .from('training_certificates')
        .select('*, profiles(full_name, email), training_modules(title)')
        .eq('verification_code', code)
        .maybeSingle()
    }

    if (matches.error) return NextResponse.json({ ok: false, error: matches.error.message }, { status: 500 })
    const c = matches.data
    if (!c || !c.id) return NextResponse.json({ ok: false, reason: 'No certificate matches this code.' }, { status: 404 })

    return NextResponse.json({
      ok: true,
      certificate: {
        id: c.id,
        brokerName: c.profiles?.full_name ?? null,
        brokerEmail: c.profiles?.email ?? null,
        moduleTitle: c.training_modules?.title ?? null,
        issuedAt: c.issued_at,
        code: c.verification_code,
        verified: Boolean(c.verified_at),
        verifiedAt: c.verified_at,
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'verification failed' }, { status: 500 })
  }
}

// POST /api/certificates/generate — issue a certificate for a broker+module and
// fire the "training certificate earned" email. Authorizes via the caller's
// Supabase session (user-scoped) but writes with the service role.
export async function POST(req: NextRequest) {
  const authenticated = await authenticateProfileRequest(req)
  if (!authenticated) return unauthorizedResponse()
  const body = await req.json().catch(() => ({}))
  const { brokerId, moduleId, moduleTitle, brokerName, brokerEmail, template } = body
  if (!brokerId || !moduleId) return NextResponse.json({ ok: false, error: 'missing params' }, { status: 400 })
  if (!(await canAccessProfile(authenticated, brokerId))) return forbiddenResponse()
  const svc = SVC
  if (!svc) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 })

  const issuedAt = new Date().toISOString()
  const code = makeCode()
  const key = makeKey({ broker: brokerId, module: moduleId, issued: issuedAt, code })

  const { data, error } = await svc
    .from('training_certificates')
    .upsert({
      broker_id: brokerId,
      module_id: moduleId,
      issued_at: issuedAt,
      verification_code: code,
      certificate_key: key,
      template: template || 'gold',
    }, { onConflict: 'broker_id,module_id' })
    .select('*, training_modules(title)')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const certId = data.id
  const courseTitle = data.training_modules?.title || moduleTitle || 'a training course'
  const name = brokerName || 'you'

  // Fire-and-forget the certificate email (queues if SMTP unconfigured).
  if (brokerEmail) {
    void (async () => {
      try {
        const { notify } = await import('@/lib/email')
        await notify('training_certificate', brokerEmail, {
          brokerName: name,
          courseTitle,
          certificateId: certId,
        })
      } catch (e) {
        console.log('[cert] email skip:', (e as Error).message)
      }
    })()
  }

  // Full CBI program completion → tell the broker (agency owner/admin) that
  // this agent finished training. In-app notification + web push.
  if (moduleId === 'c0dec0de-00ff-4000-8000-0000000000ff') {
    const agencyId = authenticated.memberships?.[0]?.agency_id
    if (agencyId) {
      void (async () => {
        try {
          const { notifyTrainingCompleted } = await import('@/lib/notificationsServer')
          await notifyTrainingCompleted(agencyId, name)
        } catch (e) {
          console.log('[cert] broker notify skip:', (e as Error).message)
        }
      })()
    }
  }

  return NextResponse.json({
    ok: true,
    certificate: {
      id: certId,
      code,
      key,
      issuedAt,
      template: data.template || 'gold',
      courseTitle,
      verifyUrl: `${APP_URL}/dashboard/certificates?code=${code}`,
    },
  })
}
