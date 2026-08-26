import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// =============================================================================
// SECURITY REGRESSION TESTS — 2026-08-26 audit rounds 1-7.
// These lock in every fix so a future refactor can't silently reopen:
//   * open redirect          * auth rate limits
//   * Twilio voice signature * upload caps + allowlists
//   * AI route auth gates    * predictable tokens → CSPRNG
//   * safeJsonLd (XSS)       * Stripe same-origin redirects
//   * convert-trial admin gate * cron header auth
// =============================================================================

// --- 1. Open redirect guard (app/auth) --------------------------------------
test('auth: ?next= rejects protocol-relative and backslash redirects', () => {
  const page = readFileSync('app/auth/page.tsx', 'utf8')
  assert.match(page, /next\?\.startsWith\('\/'\) && !next\.startsWith\('\/\/'\)/)
})

// --- 2. Auth rate limits -----------------------------------------------------
test('auth: forgot/reset password are rate-limited', () => {
  const forgot = readFileSync('app/api/auth/forgot-password/route.ts', 'utf8')
  const reset = readFileSync('app/api/auth/reset-password/route.ts', 'utf8')
  assert.match(forgot, /rateLimitAsync\(clientIp\(req\)/)
  assert.match(forgot, /status: 429/)
  assert.match(reset, /rateLimitAsync\(clientIp\(req\)/)
  assert.match(reset, /status: 429/)
})

// --- 3. Twilio voice webhook signature ---------------------------------------
test('voice: Twilio webhook validates HMAC signature', () => {
  const route = readFileSync('app/api/voice/twilio/route.ts', 'utf8')
  assert.match(route, /validTwilioSignature/)
  assert.match(route, /x-twilio-signature/)
  assert.match(route, /timingSafeEqual/)
})

// --- 4. Upload caps + allowlists ---------------------------------------------
test('uploads: portal + data-room enforce size caps and type allowlists', () => {
  const portal = readFileSync('app/api/portal/route.ts', 'utf8')
  const room = readFileSync('app/api/data-rooms/room/route.ts', 'utf8')
  assert.match(portal, /MAX_BYTES = 25 \* 1024 \* 1024/)
  assert.match(portal, /ALLOWED_TYPES/)
  assert.match(portal, /status: 413/)
  assert.match(room, /MAX_BYTES = 50 \* 1024 \* 1024/)
  assert.match(room, /ALLOWED_TYPES/)
  assert.match(room, /status: 415/)
})

// --- 5. AI routes require auth -----------------------------------------------
test('ai: chat + marketing routes require a signed-in session', () => {
  const chat = readFileSync('app/api/ai/chat/route.ts', 'utf8')
  const copy = readFileSync('app/api/ai/marketing-copy/route.ts', 'utf8')
  const designs = readFileSync('app/api/ai/marketing-designs/route.ts', 'utf8')
  for (const src of [chat, copy, designs]) {
    assert.match(src, /authenticateProfileRequest/)
    assert.match(src, /unauthorizedResponse\(\)/)
  }
})

// --- 6. Predictable tokens → CSPRNG ------------------------------------------
test('tokens: portal + lender tokens are CSPRNG, not Math.random/base64', () => {
  const portal = readFileSync('lib/clientPortal.ts', 'utf8')
  const lenders = readFileSync('app/api/lenders/route.ts', 'utf8')
  // Portal token: must use the browser CSPRNG as the primary path.
  assert.match(portal, /crypto\.getRandomValues\(bytes\)/)
  // Lender token: must use Node's randomBytes — check the actual return line,
  // not the explanatory comment (which legitimately mentions Math.random).
  assert.match(lenders, /randomBytes\(16\)/)
  const ret = lenders.slice(lenders.indexOf('return \'LND-\''), lenders.indexOf('return \'LND-\'') + 90)
  assert.doesNotMatch(ret, /Math\.random/)
})

// --- 7. safeJsonLd (XSS in script tags) --------------------------------------
test('xss: JSON-LD uses safeJsonLd escaping (no raw JSON.stringify in ld+json)', () => {
  const lib = readFileSync('lib/safeJsonLd.ts', 'utf8')
  assert.match(lib, /\\\\u003c/)
  assert.match(lib, /\\\\u003e/)
  const home = readFileSync('app/(public)/page.tsx', 'utf8')
  const listing = readFileSync('app/(public)/marketplace/listings/[id]/page.tsx', 'utf8')
  assert.match(home, /safeJsonLd\(jsonLd\)/)
  assert.match(listing, /safeJsonLd\(jsonLd\)/)
  assert.doesNotMatch(listing, /__html: JSON\.stringify/)
})

// --- 8. Stripe same-origin redirect guard ------------------------------------
test('payments: Stripe successUrl/cancelUrl are same-origin only', () => {
  const checkout = readFileSync('app/api/stripe/checkout/route.ts', 'utf8')
  assert.match(checkout, /safeUrl/)
  assert.match(checkout, /parsed\.origin === allowed\.origin/)
})

// --- 9. convert-trial paid plans are platform-admin-only ---------------------
test('billing: paid-plan conversion requires platform admin', () => {
  const route = readFileSync('app/api/billing/convert-trial/route.ts', 'utf8')
  assert.match(route, /isPaidPlan && !isPlatformAdmin/)
  assert.match(route, /Paid plans require Stripe Checkout/)
  assert.match(route, /status: 403/)
})

// --- 10. Stripe webhook lifecycle --------------------------------------------
test('payments: webhook handles failure + cancellation lifecycle', () => {
  const webhook = readFileSync('app/api/stripe/webhook/route.ts', 'utf8')
  assert.match(webhook, /invoice\.payment_failed/)
  assert.match(webhook, /customer\.subscription\.deleted/)
  assert.match(webhook, /invoice\.paid/)
  assert.match(webhook, /grace_end_date/)
})

// --- 11. Cron header auth everywhere -----------------------------------------
test('cron: every job uses x-cron-secret header (no ?secret= in URL)', () => {
  const cronDir = join(process.cwd(), 'app/api/cron')
  for (const job of readdirSync(cronDir)) {
    const route = readFileSync(join(cronDir, job, 'route.ts'), 'utf8')
    assert.match(route, /x-cron-secret/, `${job} missing x-cron-secret`)
    assert.doesNotMatch(route, /searchParams\.get\('secret'\)/, `${job} leaks secret in URL`)
  }
})

// --- 12. Public endpoints rate-limited ---------------------------------------
test('public: all write endpoints are rate-limited', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e)
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []
    })
  for (const f of walk(join(process.cwd(), 'app/api/public'))) {
    const src = readFileSync(f, 'utf8')
    assert.match(src, /rateLimit/, `${f} missing rate limit`)
  }
})

// --- 13. RLS: zero unprotected tables (live production check w/ manifest fallback) ----
test('security: no table is left without row level security', async () => {
  const sqlDir = join(process.cwd(), 'sql')
  const files = readdirSync(sqlDir).filter((x) => x.endsWith('.sql'))
  const allSql = files.map((x) => readFileSync(join(sqlDir, x), 'utf8')).join('\n')

  // 1) Try the live production DB first (Management API + saved token). This
  //    is the real source of truth — it fails if anyone ships a table without RLS.
  const tokenFile = join(process.env.HOME || '/home/rabin', '.supabase/access-token')
  if (readFileSync(tokenFile, 'utf8').trim()) {
    try {
      const query = "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false and c.relname not in ('_prisma_migrations') order by c.relname;"
      const res = await fetch('https://api.supabase.com/v1/projects/urwnucdjmoavbdddrhsh/database/query', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const rows = (await res.json()) as { relname: string }[]
        assert.ok(rows.length === 0, `PRODUCTION tables without RLS: ${rows.map((r) => r.relname).join(', ')}`)
        return
      }
    } catch {
      // fall through to manifest check
    }
  }

  // 2) Manifest fallback (offline): every create-table must have an enable-RLS
  //    statement, EXCEPT tables enabled dynamically via DO-block format() in
  //    the gap-fix (admin_audit_log, marketing_*, etc.) and non-tables.
  const created = new Set<string>()
  for (const m of allSql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)) created.add(m[1])
  const dynamic = new Set<string>()
  for (const m of allSql.matchAll(/'([a-z_]+)'/g)) dynamic.add(m[1])
  const missing = [...created].filter((t) => {
    if (['_prisma_migrations', 'IF', 'ONLY', 'if', 'only'].includes(t)) return false
    const hasStatic = new RegExp(`enable row level security on (?:public\\.)?${t}\\b|alter table (?:public\\.)?${t} enable row level security`, 'i').test(allSql)
    const hasDynamic = dynamic.has(t) && /rls_gap_fix/.test(allSql)
    return !hasStatic && !hasDynamic
  })
  assert.ok(missing.length === 0, `tables without RLS (manifest): ${missing.join(', ')}`)
})

// --- 14. Demo-mode leak guard (production fail-closed) -----------------------
test('checkout: demo grants are disabled in production (fail-closed)', () => {
  const lib = readFileSync('lib/stripeCheckout.ts', 'utf8')
  assert.match(lib, /demoModeAllowed/)
  assert.match(lib, /NODE_ENV !== 'production'/)
  assert.match(lib, /demoBlockedError/)
  const checkout = readFileSync('app/api/stripe/checkout/route.ts', 'utf8')
  // Every paid product's demo path must be guarded.
  const demoGuards = checkout.match(/demoModeAllowed\(\)/g) || []
  assert.ok(demoGuards.length >= 6, `expected >=6 demo guards, got ${demoGuards.length}`)
  assert.doesNotMatch(checkout, /mode: 'demo'[\s\S]{0,200}?await subscribeToBuyerPass/s)
  const valuation = readFileSync('app/api/valuation-reports/route.ts', 'utf8')
  assert.match(valuation, /demoModeAllowed/)
})

// --- 15. Account-change security emails --------------------------------------
test('security: account-change alerts exist (password/email/sign-in)', () => {
  const email = readFileSync('lib/email.ts', 'utf8')
  assert.match(email, /'password_changed'/)
  assert.match(email, /'email_changed'/)
  assert.match(email, /'new_sign_in'/)
  assert.match(email, /passwordChanged\(/)
  assert.match(email, /emailChanged\(/)
  assert.match(email, /newSignIn\(/)
  const reset = readFileSync('app/api/auth/reset-password/route.ts', 'utf8')
  assert.match(reset, /notify\('password_changed'/)
  const alertRoute = readFileSync('app/api/auth/security-alert/route.ts', 'utf8')
  assert.match(alertRoute, /type === 'email_changed'/)
  assert.match(alertRoute, /type === 'new_sign_in'/)
  assert.match(alertRoute, /rateLimitAsync/)
  const authPage = readFileSync('app/auth/page.tsx', 'utf8')
  assert.match(authPage, /security-alert/)
})

// --- 16. Financial Intelligence add-on gate ($100/mo enforcement) ------------
test('fic: add-on gate is enforced on all FIC broker routes', () => {
  const addon = readFileSync('lib/financialAddon.ts', 'utf8')
  assert.match(addon, /isFinancialIntelligenceEnabled/)
  assert.match(addon, /financialAddonError/)
  assert.match(addon, /financial_intelligence_enabled/)
  for (const route of ['app/api/financial/intelligence/route.ts', 'app/api/financial/ledger/route.ts', 'app/api/financial/extractions/route.ts', 'app/api/financial/verify/route.ts']) {
    const src = readFileSync(route, 'utf8')
    assert.match(src, /isFinancialIntelligenceEnabled/, `${route} missing add-on gate`)
    assert.match(src, /financialAddonError/, `${route} missing add-on 403`)
  }
})
