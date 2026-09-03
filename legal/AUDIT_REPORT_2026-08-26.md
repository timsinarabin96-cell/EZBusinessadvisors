# CONCORD DEAL PLATFORM — FULL AUDIT REPORT
**Date:** 2026-08-26 · **Auditor:** Yavin · **Scope:** security, login, listings, safety

---

## ✅ VERIFIED SOLID (production, live checks)

| Area | Status |
|---|---|
| **RLS coverage** | **100%** — zero tables without row-level security in the live DB (verified via Management API) |
| **Service-role key** | Server-only (11 API routes); zero client-bundle references (verified imports) |
| **Security headers** | CSP, X-Frame-Options DENY, nosniff, HSTS (+preload), Referrer-Policy, Permissions-Policy (camera/mic/geo blocked), COOP/CORP |
| **Storage buckets** | `documents` + `financial_docs` private; portal files served via **1h signed URLs**; no permanent public URLs |
| **Public listing feed** | Financials gated by `show_financials` + seller approval + review stage; NDA-gated data room |
| **Auth flow** | Email-verification gate (unconfirmed blocked), **TOTP 2FA challenge**, role-aware redirect, same-site-only `?next=` (open-redirect fixed today) |
| **Publish pipeline** | Compliance evaluation + license attestation + CBI training gate before go-live |
| **Rate limiting** | **ALL 10 public endpoints** now limited (fixed today) + auth reset routes |
| **Webhooks** | Twilio SMS + voice (fixed today: voice had NO signature check), Vapi, voice-events all signature/secret-verified; cron routes CRON_SECRET-protected |
| **Uploads** | Portal 25MB + allowlist, data-room 50MB + allowlist, photos 2MB (all fixed today — were unlimited) |
| **XSS** | Newspaper renderer escapes all user content; only 14 `dangerouslySetInnerHTML` uses, all static/server-safe |
| **Tests** | **605/605 pass**, typecheck clean, production build green |
| **Supabase auth** | Email-only (no OAuth attack surface), refresh rotation on, MFA TOTP supported in-app, anon users disabled |

---

## 🔧 FIXED TODAY (audit rounds 1–5 — 14 commits: f807b03 → ae95b91)

1. **Open redirect** — `?next=` accepted `//evil.com` → now same-site-only
2. **Auth brute force** — forgot/reset password had NO rate limit → added (5/10 per 10 min)
3. **Voice webhook forgery** — Twilio voice endpoint accepted unauthenticated callbacks → HMAC signature validation added
4. **Unlimited uploads** — portal + data-room accepted any size/type → size caps + allowlists
5. **Public endpoint spam** — 9 endpoints (leads, PDFs, NDA, notify, offer) → rate-limited
6. **Dangling link** — `/LICENSE` → `/license` (route audit caught)
7. **Stale tests** — 11 tests asserted old nav/AI-routing → updated to current architecture
8. **Password policy** — Supabase min length 6 → **8** (HIBP breach check needs Pro plan — see below)
9. **Cron secret leak (`69c2559`)** — `price-alerts` used `?secret=` in URL (query strings can leak into logs) → switched to `x-cron-secret` header like all other crons
10. **Payment trust hole + webhook lifecycle (`5d49d51`)** — see HIGH #1/#2 below (both fixed)
11. **Predictable tokens (`4e8f1ef`)** — portal token was base64(dealId:email:Date.now()) — forgeable; lender links used Math.random() → both now CSPRNG
12. **Weak randomness (`b959fea`)** — certificate codes, training verification codes, admin temp passwords all used Math.random() → CSPRNG
13. **AI credit burn (`67d3683`)** — ai/chat, ai/marketing-copy, ai/marketing-designs called Claude/DeepSeek with NO session check → now require auth
14. **Rate-limit sweep (`ec5be34`, `e32ee27`, `ae95b91`)** — chat-widget/message, directory/join, newsletter, marketplace/seller-order, data-rooms/view-log all rate-limited


17. **JSON-LD XSS (`a5c668a`)** — 11 public pages injected seller-supplied data into `<script type="application/ld+json">` with no `</script>` breakout protection → new `lib/safeJsonLd.ts` (OWASP escaping) applied everywhere
18. **Stripe redirect guard (`f47f613`)** — `successUrl`/`cancelUrl` were client-supplied with no same-origin check (phishing bounce after payment) → now validated against APP_ORIGIN

Total now: **18 security fixes, 50 commits, 618/618 tests green throughout**
19. **Regression test suite (`0926bd9`)** — `tests/securityRegression.test.mts`: 13 tests lock in every fix (open redirect, auth rate limits, Twilio HMAC, upload caps, AI auth, CSPRNG, safeJsonLd, Stripe redirects, convert-trial gate, webhook lifecycle, cron headers, public rate limits, live RLS check vs production)
20. **Certificate-verify rate limit (`54f2544`)** — public cert-code lookup route now rate-limited (defense-in-depth; codes already CSPRNG 8-char)

---

## 🔧 POST-AUDIT HARDENING BATCH (2026-08-26, afternoon — 7 commits, 648/648 tests)

21. **Demo-mode production guard** — demo grants (free feature unlocks for testing) now **fail-closed in production**: disabled whenever `NODE_ENV === 'production'`, so no one can self-grant paid features unless Stripe is configured and the flow is real. Guarded all 6 demo paths in `/api/stripe/checkout` + `/api/valuation-reports`.
22. **Account-change security emails** — added `password_changed`, `email_changed`, `new_sign_in` email kinds + templates; wired into reset-password and sign-in; new `/api/auth/security-alert` endpoint (rate-limited, session-authenticated) for future account alerts.
23. **Lead marketplace pricing tiers** — per-lead pricing: Standard ($25–100, 15% platform fee), Premium ($100–350, 20%), Elite ($350–1000, 25%). `publishLead` validates price vs tier band; ledger records `platform_fee_cents`; tier badges shown on marketplace cards.
24. **Financial Intelligence add-on gate** — the $100/mo FIC flag (`agency_settings.financial_intelligence_enabled`) now actually **enforces server-side** on all four broker-facing FIC routes (intelligence reader, ledger, extractions, verify). Platform admins always pass; tenants without the add-on get a clear 403. Seller portal stays free (it's the funnel, not the product). Gate defaults to allowed when no settings row exists (prevents breaking existing tenants).
25. **FIC dashboard lock + upgrade CTA** — brokers no longer hit silent 403s: the Financial Files dashboard reads the flag on load, shows a gold “🔒 Financial Intelligence is locked” banner with an **Enable — $100/month** button (Stripe checkout for the add-on), and hides the four FIC tool cards behind the flag. Upload + auto-generation pipeline stay free.

**Regression tests #14–#16 added** (demo guard, security emails, FIC gate) → **648/648 pass, typecheck clean, build green.**

---

## ⚠️ FINDINGS TO ACT ON (ranked)

### 🔴 HIGH
1. **~~`convert-trial` trusts client `paymentConfirmed: true`~~ — FIXED 2026-08-26** (`5d49d51`): paid-plan conversion is now **platform-admin-only**; tenant admins must pay via Stripe Checkout, verified server-side by the webhook. No one can self-activate for free.
2. **~~No Stripe webhook lifecycle~~ — FIXED 2026-08-26** (`5d49d51`): added `invoice.payment_failed` (7-day grace → existing cron locks), `customer.subscription.deleted` (deactivate + grace), `invoice.paid` (renewal: extend period, clear grace, unlock). **Still to do on your side:** register the webhook URL in the Stripe dashboard (`https://concorddeal.com/api/stripe/webhook`) + confirm `STRIPE_WEBHOOK_SECRET` is set in Vercel env.

### 🟡 MEDIUM
3. **HIBP leaked-password check OFF** — needs Pro plan (~$25/mo). Enable in Supabase dashboard → Auth → Security when you upgrade.
4. **Sessions never expire** (`sessions_timebox: 0`, inactivity 0) — Management API rejected the change (403/1010, plan-scoped). **Do in Supabase dashboard:** Authentication → Sessions → absolute timeout 30 days, inactivity 14 days.
5. **`mailer_autoconfirm: true`** — Supabase auto-confirms emails; the app's own gate blocks unconfirmed users. Flip to manual confirm in dashboard → Auth → Providers → Email → Confirm email for defense-in-depth.
6. **in-memory rate limiter** — resets on deploy (Vercel serverless). Fine now; swap to Upstash/Redis when traffic grows.

### 🟢 LOW / NICE-TO-HAVE
7. **~~`price-alerts` cron secret in URL~~ — FIXED 2026-08-26** (`69c2559`): now uses `x-cron-secret` header like all other crons.
8. **Unused social keys** — `INSTAGRAM_APP_ID` has **zero code references** (verified 2026-08-26); `FACEBOOK_APP_ID`, `TIKTOK_CLIENT_KEY`, `X_CLIENT_ID` have 2 refs each. Rotate/remove the Instagram key or wire up the integration.
9. `mailer_notifications_*` all disabled — enable password/email/MFA-change emails in Supabase dashboard → Auth → Email templates → Notifications (API rejected the change: 403/1010).
10. **MFA not enforced for platform admins** — 2FA is offered per-agency (agency settings `require2fa`) and self-enrollment exists on /dashboard/security, but nothing forces admins/super_admins to enroll. Recommendation: require TOTP for all platform-admin logins once you have >1 admin (super_admin stays exempt as break-glass).

---

## 💡 BILLION-DOLLAR SUGGESTIONS (product & platform)

**Trust & compliance (sells deals):**
- **Stripe webhook + dunning** — auto-lock overdue agencies, email recovery flows (already have lock/grace states — wire them to real payment events)
- **SOC 2 readiness** — audit logs exist (`admin_audit_log`, `document_audit_logs`, `data_room_view_logs`); add quarterly export + retention policy → unlocks enterprise buyers
- **eSign (DocuSign/HelloSign)** — you have signature flows; native eSign with audit trail = higher close rates
- **Seller/buyer verification** — proof-of-funds + ID check for deals over $1M (you have `proof_of_funds` table — productize it)

**Monetization (the "billions" part):**
- **Success fee escrow** — collect your % at closing via the existing Stripe infra + commission tracker → recurring revenue, not just SaaS
- **Sponsored slots → marketplace** — sell featured placement to lenders/CPAs (built today); scale to per-industry bidding
- **White-label marketplace** — you already sell the CRM per-tenant; sell "your own BizBuySell" to brokerages (marketplace + domains already supported)
- **Lead marketplace fees** — you have buyer passes + lead marketplace; add per-lead pricing tiers

**Scaling:**
- **Upstash/Redis rate limiting** before real traffic
- **Background queues** (Inngest/QStash) for the cron-heavy email/digest/nurture jobs
- **Observability** — Sentry + Vercel Analytics; you have zero error tracking today
- **Sitemap freshness** — already dynamic; add `lastmod` from listing updates

---

## 📋 RECOMMENDED NEXT (in order)
1. Stripe webhook endpoint + lock `convert-trial` behind real payment verification
2. Session expiry + HIBP (Pro) + account-change emails
3. Upstash rate limiting + Sentry
4. eSign integration (biggest close-rate lever)
5. SOC 2 export + retention

*Not legal/tax advice — the 1099 module and filings tracker are tools; confirm with your CPA/attorney before filing season.*
