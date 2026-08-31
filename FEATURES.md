# EZ Business Advisors — Platform Feature & Security Status

_Source of truth for what's built, what's enforced, and what's open. Updated as items close (see PUNCHLIST.md for the tracked punch list)._

## Security & Data Integrity

### ✅ Enforced (verified with live evidence)

| Control | How it's enforced | Evidence |
|---|---|---|
| **Admin/broker MFA** | Login flow refuses accounts without a verified TOTP factor. `super_admin` always required; any agency with `require_2fa=true` also required. Unenrolled admins are blocked at `/auth` and forced through enrollment — no dashboard access until a factor verifies. | `e2e/mfa-enforcement.spec.ts` — live output: `MFA-BLOCK: admin without MFA was REFUSED at login — forced to enroll ✅ / MFA-ENROLL: TOTP verified → login completed ✅` (1 passed, 11.0s). |
| **Tenant isolation (RLS)** | Multi-tenant row-level security; every API route agency-gated (IDOR guards). Cross-tenant reads/writes return 403/404. | Live probe: EZ admin vs Harbor listing → readiness/review/build/closing all `403` (`Insufficient permission` / `Not a member of this listing's agency`). Suite: `e2e/tenant.spec.ts`. |
| **NDA-gated financials** | Financial figures hidden from anonymous + non-NDA sessions; pricing policy gates numbers; private storage bucket (signed URLs only). | `e2e/nda-bypass.spec.ts` — anonymous 401/403/405; storage URL guessing 400; authenticated-no-NDA buyer 403; listing-ID swap 403 (1 passed, 13.6s). |
| **Legal vault audit logging** | Every legal-vault view/list writes `admin_audit_log`: actor id+email, doc id+title, timestamp, action, slug/category/version. Visible + exportable at `/admin/audit` (legal_vault filter). | Commit `1173bd8`; route `app/api/admin/legal-vault/route.ts`. |
| **Stripe webhook (money)** | HMAC-signed webhook verification; license activation flips agency plan. | `node scripts/prove-license-webhook.mjs` — real test checkout → webhook → `plan_type: license, paid_plan_active: true` (confirmed 08-30 + 08-31). |
| **Backups** | Daily `pg_dump` cron (`0 4 * * *` → `/root/db-backups/backup.sh`), 14-day retention, restore drill passed (486 entries). | `/root/db-backups/` — last dump 1.9M (08-30). |

### ⚠️ Open / decisions

| Item | Status | Decision |
|---|---|---|
| **PITR** | Deferred (08-31) | Daily backups cover ~24h recovery for free. PITR = $100/mo + $25/mo Pro base; revisit when minute-level rollback matters. |
| **Independent pentest** | Not started | Automated NDA spec is solid; commission an adversarial pass by a real buyer account before scaling real deals. |

## Platform Capabilities (feature inventory)

- **Website**: homepage (billion-dollar redesign), marketplace hub + listings grid (search/filter/sort), premium listing detail page (NDA-gated financials, SBA calculator, market context, offers, watch, share, flyer), sell page (free/pro/enterprise plans + attestation), buyer pages (qualify/favorites/alerts/pulse/comps/sold/compare), industry/location SEO hubs, brokers & professionals directory, white-label domains.
- **CRM**: Deal Studio (One-Shot AI build: intake→financials→audit→recast→BOV/CIM/BLI→SBA→comps→buyers→photos→teaser→readiness), listings manager, 10-step workflow, review queue with trust gates (readiness, confirm gate, legitimacy, identity, training), closing & escrow tracker, leads + buyer pipeline (NDA, matching, buyer pass), deal pipeline (kanban, follow-ups, deal doctor/radar/twin, syndication), AI autopilot suite (copilot, briefings, digests, Claude/DeepSeek, AI photos), team & agency (invites, hiring packages, commissions, training/certifications, security/theme/branding), operations (calendar, communications, marketing store/newspaper/ads, reports), money (Stripe billing, expenses, commissions, 1099, Plaid, escrow, success fees).
- **Admin**: users + import, agencies, listings AI scan & flag, analytics + revenue charts, AI usage, marketplace health, ads, API keys, audit log, white-label, legal vault, escrow, trials, 1099.
- **Quality**: 835/835 unit tests, 18 e2e specs, typecheck clean, CI gate on every push (GitHub Actions).

## How to verify (raw commands)

```bash
# Unit + typecheck
npm test
npx tsc --noEmit

# Security evidence specs (need local dev server + live DB)
BASE_URL=http://localhost:3000 npx playwright test e2e/mfa-enforcement.spec.ts
BASE_URL=http://localhost:3000 npx playwright test e2e/nda-bypass.spec.ts

# Stripe webhook proof (test mode — costs nothing)
node scripts/prove-license-webhook.mjs
```
