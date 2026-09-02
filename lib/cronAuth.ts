/**
 * Shared cron authorization.
 *
 * Vercel Cron invokes routes with `Authorization: Bearer <CRON_SECRET>`.
 * Local/manual triggers (curl, OpenClaw) may use `x-cron-secret: <CRON_SECRET>`.
 * Accept BOTH so automatic Vercel crons and manual test triggers both work.
 * When no CRON_SECRET is configured the route is open (dev/preview safety valve).
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const fromHeader = req.headers.get('x-cron-secret') || ''
  const fromAuth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return fromHeader === secret || fromAuth === secret
}
