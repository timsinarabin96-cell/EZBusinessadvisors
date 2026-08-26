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

## 🔧 FIXED TODAY (7 commits: f807b03 → 5b8b727)

1. **Open redirect** — `?next=` accepted `//evil.com` → now same-site-only
2. **Auth brute force** — forgot/reset password had NO rate limit → added (5/10 per 10 min)
3. **Voice webhook forgery** — Twilio voice endpoint accepted unauthenticated callbacks → HMAC signature validation added
4. **Unlimited uploads** — portal + data-room accepted any size/type → size caps + allowlists
5. **Public endpoint spam** — 9 endpoints (leads, PDFs, NDA, notify, offer) → rate-limited
6. **Dangling link** — `/LICENSE` → `/license` (route audit caught)
7. **Stale tests** — 11 tests asserted old nav/AI-routing → updated to current architecture
8. **Password policy** — Supabase min length 6 → **8** (HIBP breach check needs Pro plan — see below)

---

## ⚠️ FINDINGS TO ACT ON (ranked)

### 🔴 HIGH
1. **~~`convert-trial` trusts client `paymentConfirmed: true`~~ — FIXED 2026-08-26** (`5d49d51`): paid-plan conversion is now **platform-admin-only**; tenant admins must pay via Stripe Checkout, verified server-side by the webhook. No one can self-activate for free.
2. **~~No Stripe webhook lifecycle~~ — FIXED 2026-08-26** (`5d49d51`): added `invoice.payment_failed` (7-day grace → existing cron locks), `customer.subscription.deleted` (deactivate + grace), `invoice.paid` (renewal: extend period, clear grace, unlock). **Still to do on your side:** register the webhook URL in the Stripe dashboard (`https://concord-deal-platform.vercel.app/api/stripe/webhook`) + confirm `STRIPE_WEBHOOK_SECRET` is set in Vercel env.

### 🟡 MEDIUM
3. **HIBP leaked-password check OFF** — needs Pro plan (~$25/mo). Enable in Supabase dashboard → Auth → Security when you upgrade.
4. **Sessions never expire** (`sessions_timebox: 0`, inactivity 0) — Management API rejected the change (403/1010, plan-scoped). **Do in Supabase dashboard:** Authentication → Sessions → absolute timeout 30 days, inactivity 14 days.
5. **`mailer_autoconfirm: true`** — Supabase auto-confirms emails; the app's own gate blocks unconfirmed users. Flip to manual confirm in dashboard → Auth → Providers → Email → Confirm email for defense-in-depth.
6. **in-memory rate limiter** — resets on deploy (Vercel serverless). Fine now; swap to Upstash/Redis when traffic grows.

### 🟢 LOW / NICE-TO-HAVE
7. **~~`price-alerts` cron secret in URL~~ — FIXED 2026-08-26** (`69c2559`): now uses `x-cron-secret` header like all other crons.
8. `X_CLIENT_ID/SECRET`, `TIKTOK_*`, `INSTAGRAM_*`, `FACEBOOK_*` keys in `.env.local` — verify each social integration is actually used or rotate/remove unused keys.
9. `mailer_notifications_*` all disabled — enable password/email/MFA-change emails in Supabase dashboard → Auth → Email templates → Notifications (API rejected the change: 403/1010).

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
