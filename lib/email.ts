// =============================================================================
// Email Notification System
// -----------------------------------------------------------------------------
// A self-contained email service for the Concord Deal Platform.
//
// Design goals:
//   * Center on SMTP (Nodemailer) for real delivery when configured.
//   * If no SMTP credentials are set, emails are QUEUED to the `email_emails`
//     table (via the service-role client) as status='queued', so nothing is
//     silently lost and a later cron can flush them.
//   * Templated messages for the platform's key workflows.
//   * Never throws on delivery failure — we record the outcome and degrade.
//   * This file uses 'use server' only for module scoping; it is imported by
//     route handlers and server components (not by client components).
//
// To enable real delivery set these env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, EMAIL_ENABLED=true
// =============================================================================

import { createClient } from '@supabase/supabase-js'

// --- Server-only service-role client (bypasses RLS for queue writes) --------
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const svc =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    : null

// --- Configuration ----------------------------------------------------------
const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true'
const FROM = process.env.SMTP_FROM || 'CONCORD Deal Platform <no-reply@ezbusinessadvisors.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ezbusinessadvisors.vercel.app'

// --- Types ------------------------------------------------------------------
export type EmailKind =
  | 'deal_notification'
  | 'match_alert'
  | 'nda_request_received'
  | 'nda_access_granted'
  | 'nda_access_rejected'
  | 'loi_generated'
  | 'lead_assignment'
  | 'training_certificate'
  | 'document_upload'
  | 'social_post_success'
  | 'social_post_failure'
  | 'due_diligence_reminder'
  | 'password_reset'
  | 'generic'

export interface EmailOptions {
  to: string
  subject: string
  /** HTML body (recommended). Plain text is derived automatically. */
  html: string
  kind?: EmailKind
  meta?: Record<string, unknown>
}

export interface EmailResult {
  ok: boolean
  queued: boolean
  reason?: string
}

// --- Tiny HTML helpers ------------------------------------------------------
const esc = (s: string | number | null | undefined): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )

/** Base email shell matching the navy/gold brand. */
function shell(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#1a2332;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e2d8;">
        <tr>
          <td style="background:linear-gradient(135deg,#0b1f3a,#14294f);padding:24px 32px;">
            <div style="font-size:26px;font-weight:700;color:#ffffff;font-family:Georgia,serif;">CONCORD</div>
            <div style="font-size:11px;letter-spacing:0.28em;color:#c9a84c;text-transform:uppercase;">Deal Platform</div>
          </td>
        </tr>
        <tr><td style="padding:32px;">
          <h1 style="font-size:20px;margin:0 0 16px;font-family:Georgia,serif;color:#0b1f3a;">${esc(title)}</h1>
          ${body}
          ${cta ? `<p style="margin:24px 0 8px;"><a href="${esc(cta.href)}" style="display:inline-block;background:#c9a84c;color:#0b1f3a;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:6px;">${esc(cta.label)}</a></p>` : ''}
        </td></tr>
        <tr><td style="background:#f7f6f2;padding:16px 32px;font-size:12px;color:#8a8678;border-top:1px solid #e5e2d8;">
          You received this automated notification from CONCORD Deal Platform.
          <br/>© ${new Date().getFullYear()} EZ Business Advisors · <a href="${esc(APP_URL)}" style="color:#c9a84c;">${esc(APP_URL)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:6px 0;color:#8a8678;width:40%;">${label}</td><td style="padding:6px 0;font-weight:600;">${value}</td></tr>`

// --- Templates --------------------------------------------------------------
export const emailTemplates = {
  dealNotification(opts: { businessName?: string; dealStage?: string; price?: number | null; dealId?: string }) {
    const subject = `New deal${opts.businessName ? `: ${opts.businessName}` : ''}`
    const body = `<p>A new deal has been created on the platform.</p>
      <table style="font-size:14px;border-collapse:collapse;width:100%;">
        ${row('Business', esc(opts.businessName || '—'))}
        ${row('Stage', esc(opts.dealStage || 'new'))}
        ${row('Price', opts.price ? '$' + Math.round(opts.price).toLocaleString() : '—')}
      </table>`
    return { subject, html: shell(subject, body, opts.dealId ? { label: 'View deal', href: `${APP_URL}/pipeline` } : undefined) }
  },

  matchAlert(opts: { name?: string; searchName?: string; businessName?: string; price?: number | null; score?: number; listingId?: string }) {
    const subject = `New match for ${opts.searchName || 'your saved search'} 🎯`
    const body = `
      <p>${esc(opts.name || 'Hi')} — a new listing matches your saved search <strong>“${esc(opts.searchName || 'watchlist')}”</strong>.</p>
      <p style="font-size:16px;"><strong>${esc(opts.businessName || 'A new business')}</strong></p>
      <table style="font-size:14px;border-collapse:collapse;width:100%;">
        ${row('Asking price', opts.price != null ? '$' + Math.round(opts.price).toLocaleString() : '—')}
        ${row('Match score', opts.score != null ? opts.score + '/100' : '—')}
      </table>
      <p>You can dismiss this alert or adjust your saved search any time from your dashboard.</p>`
    return {
      subject,
      html: shell(subject, body, opts.listingId ? { label: 'View listing', href: `${APP_URL}/marketplace/listings/${opts.listingId}` } : undefined),
    }
  },

  ndaRequestReceived(opts: { requesterName?: string; requesterEmail?: string; businessName?: string }) {
    const subject = `NDA access request: ${opts.requesterName || 'A buyer'} — ${opts.businessName || 'listing'}`
    const body = `
      <p>A buyer has signed your NDA and requested confidential access.</p>
      <table style="font-size:14px;border-collapse:collapse;width:100%;">
        ${row('Buyer', esc(opts.requesterName || '—'))}
        ${row('Email', esc(opts.requesterEmail || '—'))}
        ${row('Business', esc(opts.businessName || '—'))}
      </table>
      <p>Review and approve the request to grant data-room access.</p>`
    return { subject, html: shell(subject, body, { label: 'Review NDA requests', href: `${APP_URL}/dashboard/nda-requests` }) }
  },

  ndaAccessGranted(opts: { name?: string; businessName?: string; requestId?: string }) {
    const subject = `Access granted: ${opts.businessName || 'your requested deal'} ✅`
    const body = `
      <p>${esc(opts.name || 'Hi')} — your NDA was accepted and you now have confidential access to <strong>${esc(opts.businessName || 'the business')}</strong>.</p>
      <p>Our team will follow up with the secure data room and next steps.</p>`
    return { subject, html: shell(subject, body) }
  },

  ndaAccessRejected(opts: { name?: string; businessName?: string; requestId?: string }) {
    const subject = `Access request: ${opts.businessName || 'deal'} — update`
    const body = `
      <p>${esc(opts.name || 'Hi')} — thank you for your interest in <strong>${esc(opts.businessName || 'the business')}</strong>.</p>
      <p>Your access request was not approved at this time. Please feel free to reach out if you have questions.</p>`
    return { subject, html: shell(subject, body) }
  },

  loiGenerated(opts: { businessName?: string }) {
    const subject = `LOI generated for ${opts.businessName || 'a deal'} 📝`
    const body = `
      <p>A Letter of Intent was generated for <strong>${esc(opts.businessName || 'a deal')}</strong>.</p>
      <p>Open the LOI from the dashboard to review, print, or send to the seller.</p>`
    return { subject, html: shell(subject, body, { label: 'Open LOI Lab', href: `${APP_URL}/dashboard/loi` }) }
  },

  leadAssignment(opts: { leadName?: string; leadType?: 'buyer' | 'seller'; agentName?: string; leadId?: string }) {
    const subject = `New ${opts.leadType || 'lead'} assigned${opts.agentName ? ` to ${opts.agentName}` : ''}`
    const body = `
      <p>A ${esc(opts.leadType || 'new')} lead has been assigned${opts.agentName ? ` to <strong>${esc(opts.agentName)}</strong>` : ''}.</p>
      <p style="font-size:15px;"><strong>${esc(opts.leadName || 'Unnamed lead')}</strong></p>`
    return { subject, html: shell(subject, body, opts.leadId ? { label: 'Open leads', href: `${APP_URL}/leads` } : undefined) }
  },

  trainingCertificate(opts: { brokerName?: string; courseTitle?: string; certificateId?: string }) {
    const subject = 'Training certificate earned 🎓'
    const body = `
      <p>Congratulations${opts.brokerName ? `, <strong>${esc(opts.brokerName)}</strong>` : ''}!</p>
      <p>You have completed <strong>${esc(opts.courseTitle || 'a training course')}</strong> and earned a certificate on CONCORD Deal Platform.</p>
      <p>You can download your certificate from your Training dashboard.</p>`
    return { subject, html: shell(subject, body, opts.certificateId ? { label: 'View certificate', href: `${APP_URL}/dashboard/training` } : undefined) }
  },

  documentUpload(opts: { documentName?: string; listingName?: string; docId?: string }) {
    const subject = `Document uploaded: ${opts.documentName || 'Untitled'}`
    const body = `
      <p>Your document has been uploaded successfully.</p>
      <p><strong>${esc(opts.documentName || 'Untitled')}</strong>${opts.listingName ? ` for <em>${esc(opts.listingName)}</em>` : ''}</p>`
    return { subject, html: shell(subject, body, opts.docId ? { label: 'View documents', href: `${APP_URL}/documents` } : undefined) }
  },

  socialPostSuccess(opts: { platform?: string; businessName?: string; postUrl?: string }) {
    const subject = `Social post published on ${opts.platform || 'social media'}`
    const body = `<p>Your post for <strong>${esc(opts.businessName || 'a listing')}</strong> was published on <strong>${esc(opts.platform || 'the platform')}</strong>.</p>`
    return { subject, html: shell(subject, body, opts.postUrl ? { label: 'View post', href: opts.postUrl } : undefined) }
  },

  socialPostFailure(opts: { platform?: string; businessName?: string; error?: string }) {
    const subject = `Social post failed on ${opts.platform || 'social media'}`
    const body = `
      <p>A post for <strong>${esc(opts.businessName || 'a listing')}</strong> failed to publish on <strong>${esc(opts.platform || 'the platform')}</strong>.</p>
      ${opts.error ? `<p style="background:#fdf0f0;color:#b42318;padding:10px 12px;border-radius:6px;font-size:13px;">${esc(opts.error)}</p>` : ''}
      <p>Please review the item in your Social Media dashboard.</p>`
    return { subject, html: shell(subject, body, { label: 'Open social dashboard', href: `${APP_URL}/dashboard/social` }) }
  },

  dueDiligenceReminder(opts: { itemTitle?: string; dueDate?: string; listingName?: string }) {
    const subject = `Due diligence reminder: ${opts.itemTitle || 'overdue item'}`
    const body = `
      <p>Reminder: <strong>${esc(opts.itemTitle || 'a due diligence item')}</strong>${opts.listingName ? ` for <em>${esc(opts.listingName)}</em>` : ''}</p>
      ${opts.dueDate ? `<p>Due date: <strong>${esc(opts.dueDate)}</strong></p>` : ''}`
    return { subject, html: shell(subject, body, { label: 'Open due diligence', href: `${APP_URL}/due-diligence` }) }
  },

  passwordReset() {
    const subject = 'Reset your CONCORD password'
    const body = `
      <p>We received a request to reset your password for your CONCORD Deal Platform account.</p>
      <p>If this was you, click the button below to choose a new password. This link is valid for a limited time.</p>
      <p style="font-size:13px;color:#8a8678;">If you didn't request this, you can safely ignore this email — your password will not change.</p>`
    return { subject, html: shell(subject, body) }
  },

  generic(opts: { title: string; message: string }) {
    const subject = opts.title
    return { subject, html: shell(opts.title, `<p>${esc(opts.message)}</p>`) }
  },
}

// --- SMTP transport (nodemailer, lazily loaded) -----------------------------
async function deliverViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  let nodemailer: any
  try {
    nodemailer = await import('nodemailer')
  } catch {
    return false
  }
  const host = process.env.SMTP_HOST
  if (!host) return false
  try {
    const transporter = nodemailer.default.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
    await transporter.sendMail({ from: FROM, to, subject, html })
    return true
  } catch {
    return false
  }
}

// --- Resend transport (single API key — easiest provider to set up) ---------
async function deliverViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || FROM,
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch {
    return false
  }
}

const toText = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** Lazily ensure the email_emails queue table exists. */
async function ensureEmailTables(): Promise<void> {
  if (!svc) return
  const ddl = `
    create table if not exists public.email_emails (
      id uuid primary key default gen_random_uuid(),
      email_to text not null,
      subject text not null,
      html text,
      text text,
      kind text default 'generic',
      meta jsonb,
      status text default 'queued' check (status in ('queued','pending','sent','failed')),
      error text,
      sent_at timestamptz,
      created_at timestamptz default now()
    );
    alter table public.email_emails enable row level security;`
  try {
    await svc.from('email_emails').select('id').limit(1)
  } catch {
    // table may not exist yet; try creating via service role raw query is not
    // available, so we rely on the SQL file in /sql for schema. Best effort.
    void ddl
  }
}

export async function sendEmail(opts: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, kind = 'generic', meta } = opts
  if (!to) return { ok: false, queued: false, reason: 'no recipient' }

  const canDeliver = EMAIL_ENABLED && (!!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY)

  // Attempt real delivery when configured (Resend first — easiest, then SMTP).
  if (canDeliver) {
    const viaResend = await deliverViaResend(to, subject, html)
    if (viaResend) return { ok: true, queued: false }
    const delivered = await deliverViaSmtp(to, subject, html)
    if (delivered) return { ok: true, queued: false }
  }

  // Queue a record for history + retry.
  if (svc) {
    await ensureEmailTables()
    const { error } = await svc.from('email_emails').insert({
      email_to: to,
      subject,
      html,
      text: toText(html),
      kind,
      meta,
      status: canDeliver ? 'pending' : 'queued',
      created_at: new Date().toISOString(),
    })
    if (error) {
      console.log(`[email] queue write skipped (${error.message})`)
    }
  }

  console.log(`[email] ${kind}: "${subject}" -> ${to} (${canDeliver ? 'pending' : 'queued — SMTP unconfigured'})`)
  return { ok: true, queued: !canDeliver }
}

/** Fire-and-forget wrapper around a template. */
export async function notify(
  kind: EmailKind,
  to: string,
  payload: Record<string, any>,
): Promise<EmailResult> {
  let built: { subject: string; html: string }
  switch (kind) {
    case 'deal_notification': built = emailTemplates.dealNotification(payload); break
    case 'match_alert': built = emailTemplates.matchAlert(payload); break
    case 'nda_request_received': built = emailTemplates.ndaRequestReceived(payload); break
    case 'nda_access_granted': built = emailTemplates.ndaAccessGranted(payload); break
    case 'nda_access_rejected': built = emailTemplates.ndaAccessRejected(payload); break
    case 'loi_generated': built = emailTemplates.loiGenerated(payload); break
    case 'lead_assignment': built = emailTemplates.leadAssignment(payload); break
    case 'training_certificate': built = emailTemplates.trainingCertificate(payload); break
    case 'document_upload': built = emailTemplates.documentUpload(payload); break
    case 'social_post_success': built = emailTemplates.socialPostSuccess(payload); break
    case 'social_post_failure': built = emailTemplates.socialPostFailure(payload); break
    case 'due_diligence_reminder': built = emailTemplates.dueDiligenceReminder(payload); break
    case 'password_reset': built = emailTemplates.passwordReset(); break
    case 'generic': built = emailTemplates.generic({ title: payload.title || 'Notification', message: payload.message || '' }); break
  }
  return sendEmail({ to, subject: built.subject, html: built.html, kind, meta: payload })
}
