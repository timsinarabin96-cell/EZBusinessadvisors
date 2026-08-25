# Permission Audit — Concord Deal Platform

**Date:** 2026-08-24 · **Scope:** API route role-boundary leaks + RLS policy leaks
**Method:** Read every route handler in `app/api/` (126 files) + auth helpers in `lib/supabase/auth.ts` + migration SQL in `sql/`.
**Result:** **29 HIGH, 11 MED, 4 LOW** findings (route-level). **10 RLS clusters** (mostly HIGH) per the repo migration SQL.

---

## 1. Auth model recap (`lib/supabase/auth.ts`)

- `authenticateRequest` — any signed-in user (JWT via Bearer). No profile/membership.
- `authenticateProfileRequest` — signed-in user whose `profiles.status != 'inactive'`, plus their `agency_members` rows.
- `canManageAgency(auth, agencyId)` — caller is owner/admin **of that agency**.
- `canAccessProfile(auth, profileId)` — same user, or shares an agency.
- **Critical context:** `createServerClient()` (`lib/supabase/server.ts:18-27`) uses the **SERVICE-ROLE key (bypasses RLS)**. Any route that queries with it must enforce agency scoping in code — most routes below don't.

---

## 2. Route-level findings

### HIGH severity

| # | Route | Risk | Evidence (file:line) | Fix |
|---|-------|------|----------------------|-----|
| 1 | `POST /api/financial/generate` | Any signed-in user can run the full Recast→BOV→CIM→BLI pipeline **on any agency's listing** (service-role writes + Claude spend). Only `auth.getUser` gate, no profile/membership/listing-ownership check. | `app/api/financial/generate/route.ts:52-66` (auth gate), `:94` (`runAutoGeneration`) | Use `authenticateProfileRequest`, then `canManageAgency(auth, listing.agency_id)` before generating |
| 2 | `POST /api/financial/intelligence` | Any signed-in user submits any `listingId` and receives full extracted financials (revenue, SDE, EBITDA, debt, docs) of **any agency's listing** via service role. | `app/api/financial/intelligence/route.ts:39-47` (auth gate), `:51-56` (listing fetch, no agency filter) | Require agency membership matching `listing.agency_id` |
| 3 | `POST /api/email/send` | **Fully unauthenticated email relay** — anyone can send arbitrary branded emails to any address (spam/phishing/cost/reputation). | `app/api/email/send/route.ts:20-45` (no auth call at all) | Require `authenticateProfileRequest`; restrict to admin or add per-agency rate limit + allowlist |
| 4 | `POST /api/marketplace/match` | **Fully unauthenticated service-role route** — anyone can trigger buyer-match + email blast for any listing; also `svc!` non-null assumption. | `app/api/marketplace/match/route.ts:27-36` (no auth) | Move behind cron secret header or require broker session + listing ownership |
| 5 | `GET/POST /api/data-rooms/room` | Session path checks only "authenticated" — **any user can read/upload/rename/delete files in ANY agency's deal data room** (confidential docs, service-role). | `app/api/data-rooms/room/route.ts:55-56` (GET), `:83-84` (POST) — no `canManageAgency`/membership vs deal's agency | Resolve deal→listing→agency and require membership (or `canManageAgency` for write) |
| 6 | `GET /api/professionals?mine=1` | Returns **every professional in every agency** (incl. `email, phone, license_number, license_state`) — no agency filter despite "mine" intent. | `app/api/professionals/route.ts:38-43` (select all rows) | `.eq('agency_id', <caller agency>)` |
| 7 | `PATCH/DELETE /api/professionals` | **IDOR write/delete** — any authenticated user can update or delete any agency's professional record by id (no ownership/agency check). | `app/api/professionals/route.ts:76-82` (PATCH), `:87-93` (DELETE) | Load record, check `canManageAgency(auth, rec.agency_id)` |
| 8 | `GET/POST /api/communications` | `agencyId` is caller-supplied and never checked — **read or inject call/email/SMS logs into any agency**. | `app/api/communications/route.ts:19` (GET), `:38` (POST) | `canManageAgency(auth, agencyId)` on both |
| 9 | `GET /api/notifications` | Same pattern — read **any agency's notifications** (review alerts, deal events) by passing `?agencyId=`. | `app/api/notifications/route.ts:18` | `canManageAgency(auth, agencyId)` |
| 10 | `GET /api/stale` | Same — run stale-deal analysis and read **any agency's stale deals** (names, owners, days idle). | `app/api/stale/route.ts:15` | `canManageAgency(auth, agencyId)` |
| 11 | `GET /api/activity` | Same — **any agency's audit/activity feed**. | `app/api/activity/route.ts:15` | `canManageAgency(auth, agencyId)` |
| 12 | `GET/POST /api/autopilot/followups` | GET: cross-agency lead read. POST: **send SMS follow-ups on behalf of any agency to arbitrary numbers** (body `phone` override, no lead-ownership check). | `app/api/autopilot/followups/route.ts:20` (GET), `:35-43` (POST) | `canManageAgency`; drop body phone override; verify lead belongs to agency |
| 13 | `GET /api/comps` | Cross-agency read of **proprietary comps DB** (sale price, revenue, SDE, notes). POST is correctly gated. | `app/api/comps/route.ts:20` | `canManageAgency(auth, agencyId)` on GET |
| 14 | `GET /api/loi` | Cross-agency read of **letters of intent** (deal terms). | `app/api/loi/route.ts:54` | `canManageAgency(auth, agencyId)` |
| 15 | `GET /api/closing` | `agencyId` caller-supplied; both `listingId` path and `tracked=1` leak **any agency's closing tracker** (milestones, escrow company/account refs/amounts). | `app/api/closing/route.ts:32,39,46` | Resolve agency from the listing/record, not from the query |
| 16 | `GET/PATCH/DELETE /api/reminders` | GET: cross-agency read via `?agencyId=`. PATCH/DELETE: operate by `reminderId` with **no ownership/agency check** (can modify/delete any agency's reminders). | `app/api/reminders/route.ts:31` (GET), `:95-116` (PATCH snooze/status), `:120+` (DELETE) | `canManageAgency`; scope PATCH/DELETE by record agency |
| 17 | `GET /api/hiring` + `POST /api/hiring/review` | GET: **all agent applications platform-wide** (names, emails, phones — PII). Review: any authenticated user can approve/reject any application (no role/agency gate). | `app/api/hiring/route.ts:73-78` (GET), `:35-60` (review) | Gate GET/review to broker/admin of the application's agency (or platform admin) |
| 18 | `GET /api/intelligence/visitor-paths` | Returns **all visitors' paths across ALL agencies** (which listings each visitor viewed, intent scores) — no agency scope anywhere (`fetchVisitorPaths()` takes none). | `app/api/intelligence/visitor-paths/route.ts:18-21`; `lib/visitorIntent.ts` (no agency param) | Filter by caller agency's listings |
| 19 | `POST /api/newspaper/publish` | Any **owner/admin of any agency** can publish **any agency's edition** and blast email to **all platform subscribers** (cross-tenant action + mass mail). | `app/api/newspaper/publish/route.ts:25` (role check only, no edition-agency check), `:30-31` (edition fetch), `:40` (all subs) | Verify `edition.agency_id` in caller memberships; scope subscribers by agency |
| 20 | `PATCH/DELETE /api/email-templates` | PATCH: agency check compares against caller-controlled `body.agencyId` (bypassable). DELETE: no check at all — IDOR on any agency's templates. | `app/api/email-templates/route.ts:76-89` (PATCH), `:91-99` (DELETE) | Derive agency from the template row only |

### MED severity

| # | Route | Risk | Evidence | Fix |
|---|-------|------|----------|-----|
| 21 | `POST /api/offers` | No membership check — any signed-in user can create draft offers (and attach arbitrary buyer leads) against **any agency's listings**; response returns offer details. | `app/api/offers/route.ts:26-34`; `lib/offers.ts:64-71` (agency taken from listing, never verified against caller) | Require membership of `listing.agency_id` |
| 22 | `POST /api/push/send` | Any authenticated user can push **arbitrary notifications to any profileId** (other agencies incl.) — phishing/spam vector. | `app/api/push/send/route.ts:20-28` | `canAccessProfile` before targeting another user |
| 23 | `GET /api/training?lesson=&quiz=` | Auth = any signed-in user (fine), but **unpublished lessons and their quizzes are served by direct ID** — only module/list paths filter `is_published`. | `app/api/training/route.ts:36-48` | Add `.eq('is_published', true)` on lesson & quiz queries |
| 24 | `GET/POST/PATCH /api/syndication` | No role check (any **agent** can syndicate/accept/decline offers = broker action); agency derived from `memberships[0]` — wrong agency shown if caller belongs to several. | `app/api/syndication/route.ts:31,64,107` | Require broker/admin role; pick agency from membership matching the record |
| 25 | `GET/POST /api/email-templates` | Cross-agency read (GET `?agencyId=`) and cross-agency create/seed (POST `body.agencyId`). | `app/api/email-templates/route.ts:21,29` | `canManageAgency` on both |
| 26 | `GET /api/compliance?listingId=` | Any signed-in user can evaluate **any agency's listing** (returns business name, ref, compliance/quality analysis of private financials). | `app/api/compliance/route.ts:24-35` | Membership check on `listing.agency_id` |
| 27 | `POST /api/ai/chat` | **No auth at all** — open AI endpoint (cost abuse); booking agent 403s without a session but other agents run with anon-context; context loads depend on RLS. | `app/api/ai/chat/route.ts:70-130` (no auth call) | `authenticateProfileRequest`; scope `entityId` to caller agency |
| 28 | `POST /api/ai/marketing-copy`, `POST /api/ai/marketing-designs` | **No auth** — open paid-AI generation (cost abuse; no data read though). | `app/api/ai/marketing-copy/route.ts:32-40`; `app/api/ai/marketing-designs/route.ts` | Require authenticated session + rate limit |
| 29 | `POST /api/booking` | No auth — anyone can book appointments into **any agency's calendar** (`agencyId` caller-supplied), with conflict info returned. | `app/api/booking/route.ts:37-60` | Validate agencyId against session (chat path) or voice webhook secret |
| 30 | `POST /api/notify/buyer-interest` | No auth — can spam brokers with fake buyer emails and send arbitrary "thanks" emails to arbitrary addresses. | `app/api/notify/buyer-interest/route.ts:17-30` | Rate limit + proof-of-inquiry token; it's public-by-design but unbounded |
| 31 | `PATCH/DELETE /api/marketplace/watchlist` | IDOR — update/delete **any user's** saved searches/bookmarks by id (no ownership check). | `app/api/marketplace/watchlist/route.ts:100-146` | Scope by `buyer_profile_id` of caller |

### LOW severity

| # | Route | Risk | Evidence | Fix |
|---|-------|------|----------|-----|
| 32 | `POST /api/billing/convert-trial` | Caller-supplied `amount` recorded in `subscription_history` (admin only, but billing-integrity). | `app/api/billing/convert-trial/route.ts:49-63` | Derive amount from `PLANS` server-side |
| 33 | `POST /api/billing/checkout` | `agencyId` from body not verified (any member can open checkout sessions for other agencies — low impact, money still paid by caller). | `app/api/billing/checkout/route.ts:16-20` | `canManageAgency` |
| 34 | `DELETE /api/push/subscribe` | Unsubscribe by endpoint with no ownership check (annoyance only). | `app/api/push/subscribe/route.ts:32-38` | Scope by caller profile |
| 35 | `GET /api/broker/card`, `GET /api/certified-brokers` | Public by design but `select('*')` over the service role — only mapped fields are returned today; a future column addition (private email/phone) would leak automatically. | `app/api/broker/card/route.ts:26-33`; `app/api/certified-brokers/route.ts:24-31` | Explicit column allowlists |

### Verified OK (spot-checked, no action)
`agency/settings|theme|security`, `billing/create-agency`, `billing/bump-usage` (membership-checked), `captains-brief`, `daily-brief`, `digest`, `renewals`, `referrals(+stats)`, `valuation-reports`, `lead-marketplace`, `nurture`, `tools/csv`, `proof-of-funds`, `commissions`, `deals/buyer-scorecards`, `documents/bundle`, `onboarding`, `certificates(+complete)`, `data-rooms/access-request(+review)`, `data-rooms/intent`, `intelligence/*` (except visitor-paths), `listings/*`, `loi` POST/PATCH, `closing` POST/PATCH/DELETE, `offers` GET/PATCH, `invites`, `profile`, `plaid/*`, `email-templates/send` (template-row check — note `body.agencyId` also accepted there, see #25), `portal` (token-gated, tokens are random), `invites/[token]/*` (token-gated), `newspaper` (except publish), `blog` (broker role), `notifications` PATCH (own user), `cron/*`, `stripe/webhook`, `sms/twilio/vapi/voice/*`, `public/*`, `chat-widget/*`, `search/suggest`, `track-view`, `directory/join`, `newsletter`, `hiring/packages`.

---

## 3. RLS findings (per repo migration SQL)

**Caveat:** these are the policies as written in `sql/RUN_ALL.sql` (consolidated baseline) and `sql/FIX_ALL_2026_08_03.sql` (newest full pass) — no newer migration in the repo drops them. Verify live with a probe (`select` as a second-tenant user). All findings are `for select/update/delete ... using (true)` = **any authenticated user can read/modify every row across all agencies** via the client API, bypassing the routes entirely.

| Table | Policy (file:line) | Exposure | Severity |
|-------|--------------------|----------|----------|
| `client_portal_access` | `sql/RUN_ALL.sql:2486-2492` | **Portal access TOKENS readable/writable by any user** → take over any client portal (deal docs, messages, uploads) | HIGH |
| `portal_messages` | `sql/RUN_ALL.sql:2495` | All portal message threads readable | HIGH |
| `listings` | `sql/RUN_ALL.sql:2673-2676` (`listings_auth_read using (true)`); also `emergency_public_marketplace_lockdown.sql:52` | Any authenticated user reads **all listings incl. drafts/pending + all financial columns** of every agency | HIGH |
| `deals`, `seller_leads`, `buyer_leads` | `sql/RUN_ALL.sql:2697-2700, 2716-2740` | Full CRM read of every agency's deals/leads (contacts, prices, notes) + insert/update/delete | HIGH |
| `listing_documents`, `listing_financials`, `listing_recasts`, `cim_versions`, `bov_versions`, `bli_versions`, `sba_qualifications`, `due_diligence_items`, `listing_workflows` | `sql/RUN_ALL.sql:1399-1483` (re-affirmed for `listing_documents` in `FIX_ALL_2026_08_03.sql:60-67`) | Confidential deal docs, financials, CIM/BOV versions, diligence items — cross-agency read **and** write | HIGH |
| `financial_documents` | `sql/financial_files_schema.sql:68-71` + `sql/harden_financial_documents_rls.sql` (fix keeps `using (true)` "any signed-in user") | Cross-agency read of uploaded financial files + insert; update/delete gated by **global** `is_broker_or_admin()` (any agency's broker can edit any agency's files) | HIGH |
| `commissions`, `deal_commissions`, `deal_closing_details`, `agent_performance`, `broker_financial_files` | `sql/RUN_ALL.sql:1521-1560, 2154-2158` | Commission amounts/splits, closing details, broker financial files — cross-agency read+write | HIGH |
| `nda_requests` | `sql/RUN_ALL.sql:1499-1505` | All NDA requests (buyer names/emails/phones + status) cross-agency | HIGH |
| `agent_applications` | `sql/RUN_ALL.sql:2557-2567` | All applications (PII) readable **and updatable** by any user — self-approve possible | HIGH |
| `public_listings` | `sql/RUN_ALL.sql:2881-2893` | Any authenticated user can insert/update/delete **any marketplace listing row** | HIGH |
| `newspaper_editions/articles/subscriptions/delivery_log` | `sql/RUN_ALL.sql:2084-2112` | Subscriber emails + edition content cross-agency (read/write) | MED |
| `agency_members`, `webhook_events`, `bbs_syncs` | `sql/RUN_ALL.sql:396, 420, 432` | Membership enumeration (profile→agency→role) & webhook payloads | MED |

Also note: `listings_owner_update` (`RUN_ALL.sql:2678-2685`) lets **any** user with `role='admin'` (global, not agency-scoped) update any listing.

---

## 4. Training API — task item check (`app/api/training/route.ts`)

- ✅ Modules: `.eq('is_published', true)` enforced (`:33`); joined lessons filtered by `is_published` (`:63`).
- ⚠️ **Unpublished content by ID:** `?lesson=<id>` (`:43-48`) and `?quiz=<lessonId>` (`:36-41`) return any lesson/quiz regardless of publish status → **MED** (finding #23).
- ⚠️ Auth is `authenticateRequest` only — any signed-in user (incl. buyers) can read curriculum; acceptable for platform content but note it.
- ✅ No progress endpoint exists in this route (nothing to scope; progress lives client-side / elsewhere).

---

## 5. Recommendations (quick wins first)

1. **The `agencyId`-from-query/body pattern is the #1 systemic hole** (findings 8-16, 19, 25): always resolve the agency from the **record** (`listing.agency_id`, `offer.agency_id`, …) and call `canManageAgency(auth, thatAgency)` — never trust `?agencyId=`/`body.agencyId`.
2. **Audit every service-role query** in routes for an ownership filter — `createServerClient()` bypasses RLS by design (findings 1, 2, 5, 6, 7, 17, 18).
3. **Replace `using (true)` policies** with `public.is_agency_member(agency_id)` (already exists and is used correctly for `listings` in `core_agency_isolation.sql:163`, `communications`, `notifications`, `reminders`, etc.).
4. **Close the unauthenticated action routes**: `email/send`, `marketplace/match`, `ai/*`, `booking`, `notify/buyer-interest` — add session or secret/rate-limit gates.
5. Add `is_published` filters to training lesson/quiz fetches; add ownership checks to `professionals`, `email-templates`, `reminders`, `watchlist` writes; verify edition ownership in `newspaper/publish`.

---

*Report generated from a read-only audit — no application code was modified.*
