/**
 * lib/emailQueue.ts — delivery verification + queue flush for email_emails.
 *
 * The weekly digest (and every other email) can silently queue when delivery
 * isn't configured or a provider breaks (the Aug 2026 incident: 160 emails
 * queued with no alert). These helpers make delivery observable:
 *
 *   countStuckQueued()   — how many rows are queued/pending and how old
 *   flushEmailQueue()    — re-attempt delivery of queued rows via sendEmail
 *   assertDigestDelivery()— after a digest run, alert the boss if anything
 *                          queued instead of delivered
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const BOSS_EMAIL = process.env.VOICE_AGENT_BROKER_EMAIL || 'info@ezbusinessadvisors.com'
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true'

function svc() {
  return SUPABASE_URL && SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null
}

/** Count queued/pending email rows, with the oldest row's age in hours. */
export async function countStuckQueued(): Promise<{ queued: number; pending: number; oldestHours: number | null }> {
  const db = svc()
  if (!db) return { queued: 0, pending: 0, oldestHours: null }
  const { data, error } = await db
    .from('email_emails')
    .select('status, created_at')
    .in('status', ['queued', 'pending'])
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return { queued: 0, pending: 0, oldestHours: null }
  const queued = (data || []).filter((r: any) => r.status === 'queued').length
  const pending = (data || []).filter((r: any) => r.status === 'pending').length
  const oldest = (data || [])[0] as { created_at?: string } | undefined
  const oldestHours = oldest?.created_at ? Math.round((Date.now() - new Date(oldest.created_at).getTime()) / 3600000) : null
  return { queued, pending, oldestHours }
}

/** Re-attempt delivery of queued email rows (up to `limit`). Each row is
 * re-sent via the normal sendEmail path; on success the row is marked 'sent'
 * (sendEmail records a NEW row, so we update the old one to avoid dupes).
 * Rows addressed to obvious test domains (tenant.test / example.com) are
 * skipped — re-sending those would just bounce and add noise.
 * Returns how many were flushed. */
export async function flushEmailQueue(limit = 25): Promise<{ flushed: number; failed: number; skipped: number }> {
  const db = svc()
  if (!db) return { flushed: 0, failed: 0, skipped: 0 }
  const { data, error } = await db
    .from('email_emails')
    .select('id, email_to, subject, html, text, kind')
    .in('status', ['queued', 'pending'])
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error || !data?.length) return { flushed: 0, failed: 0, skipped: 0 }

  const isTestDomain = (email: string) => /@(tenant\.test|example\.com|test\.[a-z]+)$/i.test(email || '')
  let flushed = 0
  let failed = 0
  let skipped = 0
  for (const row of data as any[]) {
    try {
      if (isTestDomain(row.email_to)) {
        // Mark stale test-domain rows so they stop polluting the queue count.
        await db.from('email_emails').update({ status: 'failed', error: 'test recipient — skipped by flusher' }).eq('id', row.id)
        skipped++
        continue
      }
      const res = await sendEmail({ to: row.email_to, subject: row.subject, html: row.html, kind: row.kind || 'generic' })
      if (res.ok && !res.queued) {
        await db.from('email_emails').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id)
        flushed++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }
  return { flushed, failed, skipped }
}

/**
 * Post-digest delivery assertion: run this after a digest/bulk send. If any
 * rows are still queued (delivery not configured / provider broken), email
 * the boss so a silent queue can never happen again.
 */
export async function assertDigestDelivery(context: string): Promise<{ ok: boolean; queued: number; pending: number }> {
  const { queued, pending, oldestHours } = await countStuckQueued()
  const stuck = queued + pending
  if (stuck > 0) {
    await sendEmail({
      to: BOSS_EMAIL,
      subject: `🚨 EMAIL DELIVERY ALERT — ${stuck} emails stuck in queue (${context})`,
      html: `<h2 style="margin:0 0 12px;font-family:Georgia,serif;">Emails are queueing, not delivering</h2>
        <p><strong>${queued} queued / ${pending} pending</strong> rows in email_emails${oldestHours != null ? `, oldest <b>${oldestHours}h</b> old` : ''}.</p>
        <p>Delivery is ${EMAIL_ENABLED ? 'enabled' : '<b style="color:#b00020">NOT enabled (EMAIL_ENABLED=false)</b>'}. Check SMTP/Resend/Graph credentials or the provider status.</p>
        <p style="color:#888;font-size:13px;">This alert fires whenever a digest/bulk send leaves mail queued — silent queueing is a known failure mode.</p>`,
      kind: 'generic',
    }).catch(() => {})
    return { ok: false, queued, pending }
  }
  return { ok: true, queued: 0, pending: 0 }
}
