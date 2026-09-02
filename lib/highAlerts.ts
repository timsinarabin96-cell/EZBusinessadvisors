import { sendEmail, type EmailResult } from './email'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character))

export async function sendHighAlert(input: { summary: string; details: string; agencyName?: string | null; recipients?: string[]; meta?: Record<string, unknown> }): Promise<EmailResult[]> {
  const platformEmail = process.env.VOICE_AGENT_BROKER_EMAIL || process.env.ADMIN_EMAIL || 'rtimsina@ezbusinessadvisors.com'
  const recipients = [...new Set([platformEmail, ...(input.recipients || [])].filter(Boolean))]
  const subject = `🚨 HIGH ALERT — ${input.summary}`
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px"><div style="background:#991b1b;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><strong style="font-size:19px">🚨 HIGH ALERT</strong><div style="margin-top:6px">${esc(input.summary)}</div></div><div style="border:1px solid #fecaca;border-top:0;padding:20px 22px;border-radius:0 0 12px 12px"><p>${esc(input.details)}</p><p style="color:#6b7280;font-size:12px">Scope: ${esc(input.agencyName || 'Platform')} · ${esc(new Date().toISOString())}</p></div></div>`
  return Promise.all(recipients.map((to) => sendEmail({ to, subject, html, kind: 'high_alert', meta: { ...(input.meta || {}), critical: true } }).catch((error) => ({ ok: false, queued: false, reason: error instanceof Error ? error.message : 'send failed' }))))
}
