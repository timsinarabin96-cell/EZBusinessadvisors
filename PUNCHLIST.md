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
- **2026-09-02 infra:** TWO Vercel projects discovered — live = `ezbusinessadvisors` (ezbusinessadvisors.vercel.app, git-linked, current); `concord-deal-platform` project = stale since Aug 29, no git link, old crons still active. Decision needed: archive/delete stale project. All cron routes now accept Vercel Bearer auth (lib/cronAuth.ts). Email test-domain guard live (no more NDR junk).
## 📅 Status update — 2026-09-04 (verified today)

| Item | Status | Evidence |
|---|---|---|
| Photo studio API (FAL) | ✅ **VERIFIED WORKING today** | Live call `fal.run/fal-ai/flux-pro/v1.1` with project `FAL_KEY` → HTTP 200, image generated in ~6.8s. Key live in `.env.local` + Vercel prod. Punchlist's "Photo API key — Not started" row is now CLOSED. |
| Twilio SMS outbound (A2P) | ❌ **BLOCKED — carrier filtering** | Two live test sends (broker `+17177067457` + alt `+17174613193`) both came back **undelivered, Twilio error 30034**. Cause: US long-code → mobile requires **A2P 10DLC campaign registration** (brand + campaign in Twilio console). This is now the confirmed reason broker alerts never arrived. SMS webhook/inbound side still works; outbound needs boss's Twilio console action. |
| ValuTrax | ✅ **CANCELLED — written confirmation received 09-04** | Sam Mohlenhoff (sam@bbpinc.com) replied 16:01Z: "We have cancelled the subscription for you. You will not be charged again." + formal "Subscription Expired" notice 15:57Z (info@bbpinc.com). Cancellation email sent 15:53Z. **CLOSED — no Sep 10 charge.** |
| Stripe LIVE keys | 🔴 Still `sk_test` | Vercel prod + `.env.local` both test; no `sk_live` on box. Boss to paste `sk_live_…` + live webhook secret. |

### Closed since last punchlist refresh (Sep 1–3, all committed/verified)
- Dead-code sweep: ~1,060 lines removed across 7 commits (`305c622`..`6756628`), typecheck + 1068 tests green
- UX gaps: listing-detail hero Save/Compare (`5b43196`, `db94397`); hero search overlap fix (`ca050bf`)
- Admin access: easy passwords on both boss logins; `timsinarabin96@gmail.com` promoted to super_admin
- Verification audit: 26 auth users, all email-confirmed; no broker missing license/phone verification
- Email overhaul: biz inbox 32→6, archive folders; project archive mirrored (VPS master)
- Digest: hourly → 2×/day 9AM/9PM ET (`be03e67`)
- Brand: EZ chrome-hex logo + palette applied (`fed3efb`)
- Demo: full 21-min narrated master film + chapter videos delivered by email
- Ops: Twilio real auth token + webhooks live; Cloudflare email routing on concorddeal.com; cost ledger + revenue playbook + project archive created

### Still open (boss-side unless noted)
1. 🔴 **Stripe LIVE keys** — biggest revenue blocker (paste `sk_live_…` + live webhook secret)
2. 🔴 **Twilio A2P 10DLC registration** — blocks all outbound SMS (proven today, error 30034)
3. ValuTrax written confirmation before Sep 10
4. Outlook Entra app registration (optional — unblocks Gmail-side email cleanup)
5. Empty Deleted Items (335 msgs) — needs boss OK
6. Stale Vercel project `concord-deal-platform` — archive/delete decision
7. Independent pentest (optional commission)
8. Growth track (not started): unit economics CAC/LTV, white-label self-serve onboarding, buyer trust badges, sold-comps data moat
