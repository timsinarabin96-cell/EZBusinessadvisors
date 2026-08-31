# EZ Business Advisors Platform — Punch List
_Last updated: Aug 31, 2026_

Status legend: ✅ Verified done · ⏳ In progress · ⚠️ Open gap · 🔲 Not started

## Security & Data Integrity

| Item | Status | Owner | Notes |
|---|---|---|---|
| Admin/broker MFA enforcement | ✅ Verified | Yavin | Live TOTP test: unenrolled admin blocked at login, forced to enroll. Raw output: `MFA-BLOCK: admin without MFA was REFUSED at login — forced to enroll ✅ / MFA-ENROLL: TOTP verified → login completed ✅ / 1 passed (11.0s)` (`e2e/mfa-enforcement.spec.ts`). Enforcement: super_admin always; any agency require_2fa=true. Note: rtimsina (super_admin) will see enroll screen on next login. |
| NDA-gated financials — bypass hardening | ✅ Verified | Yavin | `e2e/nda-bypass.spec.ts` 1/1 green: anonymous 401/403/405, storage-URL guessing 400 (private bucket), authenticated-no-NDA buyer 403, listing-ID swap 403. |
| Legal vault access logging | ✅ Verified | Yavin | `app/api/admin/legal-vault/route.ts` writes admin_audit_log on view+list: actor id+email, doc id+title, timestamp, action (view/list), slug/category/version. Viewable + exportable at `/admin/audit` (legal_vault filter added). Commit `1173bd8`. |
| Stripe webhook (money flow) | ✅ Verified | Yavin | Live proof re-run 08-31: real test checkout `cs_test_...` ($5,499 test) → HMAC webhook → agency flipped `plan_type: license, paid_plan_active: true`. Script: `scripts/prove-license-webhook.mjs`. |
| Point-in-time recovery (PITR) | ✅ Decision made — deferred | Rabin | Daily backup cron verified running (`0 4 * * * /root/db-backups/backup.sh`, 14-day retention, last dump 1.9M). Decision 08-31: skip PITR ($100/mo + Pro $25/mo) for now; re-evaluate when minute-level rollback matters. |
| Independent pentest — NDA gate | 🔲 Not started | Rabin (commission) | Automated spec solid; recommend dedicated adversarial pass by real buyer account before scaling real deals. |
| Tenant isolation (RLS) | ✅ Verified | Yavin | Cross-tenant probe: EZ admin vs Harbor listing → 403 on readiness/review/build/closing. Suite: tenant.spec 5/5. |

## Reliability / Engineering Hygiene

| Item | Status | Owner | Notes |
|---|---|---|---|
| CI pipeline (GitHub Actions) | ✅ Delivered | Yavin | `.github/workflows/ci.yml` (typecheck + 835 unit tests + prod build on push/PR; step count updated 786→835) + `e2e.yml` (on-demand live-site suite). This commit triggers a fresh CI run — verify green in Actions tab. |
| Unit + e2e test suite | ✅ Verified (as of last run) | Yavin | 835/835 unit, typecheck clean, 18 e2e specs incl. the two new security specs. CI gate makes it permanent. |
| FEATURES.md / security status doc | ✅ Delivered | Yavin | Repo root `FEATURES.md` — what's enforced vs. open, how to verify with raw commands. Source of truth alongside this file. |

## Loose Ends

| Item | Status | Owner | Notes |
|---|---|---|---|
| Photo API key (FAL or OpenAI) | 🔲 Not started | Rabin | Cheap, unblocks AI photo studio. Needs provider decision + key. |
| Upstash env (rate limiting at scale) | 🔲 Deferred | Rabin | Only needed when traffic grows — no action now. |

## Growth / "Billion-Dollar" Track (after security is locked)

| Item | Status | Owner | Notes |
|---|---|---|---|
| Unit economics tracking (CAC/LTV per agency) | 🔲 Not started | Rabin + Yavin | Nothing in current feature set tracks this — first question in any valuation/investor conversation. |
| White-label onboarding flow | ⚠️ Needs audit | Yavin | Audit result (08-31): **manual** — `scripts/provision-white-label.mjs` (needs SUPABASE_ACCESS_TOKEN + VERCEL_TOKEN, one-command); `/api/billing/create-agency` exists for self-serve agency creation but full white-label spin-up is not self-serve. Bottleneck risk. |
| Trust signals for buyers | 🔲 Not started | Rabin + Yavin | Scam detection exists in backend — consider surfacing as visible trust badge to buyers putting up real money. |
| Data moat (valuation/comps data reuse) | 🔲 Not started | Rabin + Yavin | Sold-comps data grows per transaction — confirm structured for reuse, not just sitting in Postgres. |

## How to use this
- Standing instruction for Yavin: any item marked "done" comes with raw command/output, not a description — same pattern that's worked so far.
- Update this file (not just chat) as items close, so it stays the source of truth instead of scattered across conversations.
