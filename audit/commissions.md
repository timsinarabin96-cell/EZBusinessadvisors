# Commission Waterfall Audit — Concord CRM

**Date:** 2026-08-24
**Scope:** Does a deal's commission split actually flow into the commissions ledger end-to-end?
**Method:** Static code audit (lib/, app/api/, components/, sql/) + live DB probe via service role
(`scripts/probe-commissions.cjs`, `scripts/probe-commissions2.cjs` — read-only, kept for re-probing).

---

## 1. Intended Flow (what the system *should* do)

```
hiring_packages.commission_split (50/70/80)
        │  hire/onboard agent
        ▼
agency_members.commission_split  ──┐
                                  │  listing approval
listings.commission_split_agent ◄─┘  (broker sets split at review)
listings.commission_split_brokerage
        │  deal created (purchase_price)
        ▼
deals (pipeline: LOI → UC → DD → closing → closed)
        │  stage = 'closed'  ← CLOSE EVENT
        ▼
commission_records row created  (amount = purchase_price × fee_rate × agent_split)
        │  broker reviews
        ▼
pending → approved → paid (paid_at stamped)
        │
        ▼
payout / CSV export (commissions ledger UI + exportCommissionsCsv)
```

---

## 2. Where it WORKS today (verified live)

| Layer | Status | Evidence |
|---|---|---|
| `commission_records` table + RLS | ✅ exists, queryable, **0 rows** | live probe: count=0, select `*, listings(business_name), profiles(full_name)` join OK |
| `lib/commissions.ts` — record / list / update status / CSV | ✅ solid, service-role, never throws | `recordCommission` inserts with `status='pending'`, `updateCommissionStatus` stamps `paid_at` |
| `app/api/commissions/route.ts` GET/POST/PATCH | ✅ auth'd (`authenticateProfileRequest` + `canManageAgency`), CSV export | verified |
| Commissions dashboard (`app/dashboard/commissions/page.tsx`) | ✅ reads ledger, manual entry form, waterfall UI, status advance, CSV download | verified |
| Hiring packages seeded 50/70/80 | ✅ live rows exist (`Associate 50`, `Senior 70`, `Managing Broker 80`) | live probe |
| Listing review CAN set `commission_split_agent` | ✅ but only as optional param — **never populated live** (all NULL) | `app/api/listings/review/route.ts:51` + probe |

---

## 3. Where it BREAKS — gaps (ranked)

### 🔴 GAP 1 — CRITICAL: Nothing records a commission when a deal closes
- `recordCommission` is called from **exactly one place**: `app/api/commissions/route.ts:57` (POST, manual broker entry). No page, no cron, no route calls it on close.
- Stage moves are **client-side only**: `components/deals/DealPipeline.tsx:78/209` → `lib/pipeline.ts` `moveDealStage()` → `@/lib/supabase/client` direct UPDATE of `deals.status`. There is **no server route for deals** (`app/api/deals/` contains only `buyer-scorecards/`), so no hook can fire on `closed`.
- **No DB trigger** on `deals`/`listings` creates commission rows (trigger files present in `sql/`: `auto_match_trigger.sql`, `core_agency_isolation.sql`, `listing_refs_reminders_schema.sql`, `plaid_schema.sql` — none touch `commission_records`).
- **Live proof:** 13 deals with `status='closed'` (purchase prices from $382K to $4.16M) → `commission_records` = **0 rows**. `commission_records.for_closed_deals` = `[]`.
- The only close-adjacent hook is the **success-fee** hook in `app/api/closing/route.ts` PATCH (fires when a `closing`-category milestone completes) — that records the *platform* cut, not the agent commission, and it is **broken** (see GAP 4).

### 🟠 GAP 2 — HIGH: Commission amount is never computed server-side; splits are dead columns
- `lib/pipeline.ts` `EnrichedDeal` carries only `business_name, industry, asking_price, headline, primary_image_url`. It does **NOT** carry `commission_split_agent` / `commission_split_brokerage` (they exist on `listings` live, all NULL).
- `components/deals/DealDetail.tsx` "Deal Economics" is **purely client-side `useMemo`** with **hardcoded** `FEE_RATES=[8,10,12]` (default 10%) and `SPLIT_TIERS=[50,70,80]` (default 70%) — interactive pills, nothing read from the listing/package, nothing persisted, no "record commission" button. Numbers vanish on close.
- `listings.commission_split_agent` / `_brokerage` are **write-only**: set only via optional `commissionSplitAgent` in `app/api/listings/review/route.ts:51`; **never read anywhere** in app code (grep: only `lib/listings.ts:52-53` type defs + review route).
- `agency_members.commission_split` exists live but is **never written** (all NULL) — hiring flow (`app/api/hiring/route.ts`, `lib/hiring.ts`) only tracks applications; nothing copies `hiring_packages.commission_split` → member.
- `deals` table has **no fee_rate column** (columns: agency_id, buyer_lead_id, created_at, expected_close_date, fts_document, id, listing_id, loi_signed_at, notes, purchase_price, status, title, updated_at). Fee % lives only in a UI slider.

### 🟠 GAP 3 — MEDIUM/HIGH: Manual entry is the only path and it's deal-blind
- `app/dashboard/commissions/page.tsx` record form takes raw **Listing ID**, raw **Agent profile ID**, amount, pct, notes — **no dealId field is even sent** in the POST body (page.tsx `record()` omits `dealId`).
- `recordCommission` requires a positive hand-typed amount; there is **no calculation path** and **no idempotency** — double-click / double-close would create duplicate rows (unlike `recordSuccessFee`, which is idempotent per `(listing_id, deal_id)`).

### 🟡 GAP 4 — MEDIUM: The one existing automation hook (success fee) is broken live
- `app/api/closing/route.ts` PATCH → `recordSuccessFee` when a `closing` milestone completes — but **`success_fee_records` table does not exist in the live DB** (live probe: `PGRST205 Could not find the table 'public.success_fee_records'`). The schema file exists (`sql/success_fee_schema.sql`) but was never applied, so the hook silently no-ops (`try/catch` best-effort).
- Even if the table existed: it uses `listings.asking_price` as sale price (not `deals.purchase_price`) and passes `dealId: null`.
- Also note `deal_closing_milestones` has **0 rows** live — the tracker has never been used, so this path has never fired for anyone.

### 🟡 GAP 5 — LOW/MEDIUM: Split provenance is untracked
- No linkage between a listing's `commission_split_agent` and the actual hired agent (`agency_members.profile_id` / `deals.buyer_lead_id`). Even after GAP 1–2 fixes, there is no unambiguous "who earns this deal's split" resolution in the schema — `commission_records.agent_profile_id` has no defined source.

---

## 4. Answers to the audit questions

1. **Row created automatically on close?** No. `recordCommission` is called only from `POST /api/commissions` (manual). Nothing calls it on deal close; `moveDealStage('closed')` is a direct client-side UPDATE with no server hook, and no DB trigger exists. **13 closed deals, 0 commission rows live.**
2. **Does the pipeline read `commission_split_agent`?** No. `EnrichedDeal` carries only name/industry/asking_price/headline/image. Split columns exist on `listings` but are never read by any app code.
3. **Server-side computation of commission amount?** None. The only computation is `DealDetail.tsx` `useMemo` (client, hardcoded 10% fee / 70% split defaults, ephemeral). No `purchase_price × fee_rate × agent_split` is ever computed or written anywhere server-side.
4. **`/api/commissions` auth + inputs?** Auth: `authenticateProfileRequest` (Bearer) + `canManageAgency` on both GET and POST; POST body: `{agencyId, listingId?, dealId?, agentProfileId?, amount, commissionPct?, notes?}` — `amount` required positive. It **can** be triggered per deal (dealId supported by the API) but **nothing in the UI sends dealId** and nothing automates it.
5. **Closing tracker triggers commission?** No. `/api/closing` only records *milestones/escrow* and fires a **success-fee** hook on closing-milestone completion (platform cut, broken — table missing live). No commission recording.
6. **Schema/triggers?** `sql/commissions_schema.sql` creates the table + RLS + index only. No triggers on `deals`/`listings` create commission rows (checked all trigger-bearing SQL files; none reference `commission_records`).

---

## 5. Fix Plan (no code changed — recommendations only)

### P0 — Server-side close hook (closes GAP 1)
1. Add a server route for deal stage changes, e.g. **`app/api/deals/[id]/stage/route.ts`** (PATCH `{status}`), and point `DealPipeline.tsx`/`lib/pipeline.ts` `moveDealStage` at it instead of the direct client UPDATE.
2. In that route, when transitioning **to `'closed'`**: fetch `deals.purchase_price` + `listings(commission_split_agent, asking_price, agency_id)` + the deal's agent (via `agency_members`/`profiles`), compute `amount = purchase_price × fee_rate% × agent_split%`, and call `recordCommission({agencyId, listingId, dealId, agentProfileId, amount, commissionPct: agentSplit})`.
3. **Idempotency:** check existing `commission_records` by `deal_id` before insert (or add a unique partial index on `deal_id`), mirroring `recordSuccessFee`'s `(listing_id, deal_id)` guard.

### P1 — Make splits real data (closes GAP 2)
4. `lib/pipeline.ts`: add `commission_split_agent`, `commission_split_brokerage` (and `agency_id`) to the listings `select` + `EnrichedDeal`.
5. `components/deals/DealDetail.tsx`: initialize `feeRate`/`split` from the listing's stored values (fallback: agency member split → package split) instead of hardcoded defaults; add a **"Record commission"** button that POSTs `/api/commissions` with the computed amount + `dealId`; label the panel "estimate, not recorded".
6. Add a source-of-truth **fee_rate column** on `listings` (set at review, alongside `commission_split_agent`), so the fee % is data, not a UI pill.
7. `app/api/hiring/route.ts` (or onboarding): when an application is approved/hired, write `agency_members.commission_split = hiring_packages.commission_split` (currently never populated).
8. Listing review form: surface `commissionSplitAgent` + `commissionSplitBrokerage` inputs so the optional param in `app/api/listings/review/route.ts` is actually exercised.

### P2 — Ledger UX + safety (closes GAP 3)
9. Commissions form (`app/dashboard/commissions/page.tsx`): add **deal selector** (dropdown of deals w/ purchase_price) and send `dealId`; auto-suggest amount from deal × split.
10. Add dedupe guard + `deal_id` unique index; show deal name in the ledger list (already joins `listings`, add `deals(title)`).

### P3 — Repair or remove the success-fee hook (closes GAP 4)
11. Apply `sql/success_fee_schema.sql` to the live DB (table missing → hook silently no-ops today), or delete the hook in `app/api/closing/route.ts`.
12. Use `deals.purchase_price` (not `listings.asking_price`) and pass `dealId` to `recordSuccessFee`.

---

## 6. Top 3 gaps (summary for reporting)

1. **CRITICAL — No commission on deal close.** `recordCommission` is called only from manual `POST /api/commissions`; stage moves are client-side (`components/deals/DealPipeline.tsx` → `lib/pipeline.ts` `moveDealStage`); no server route, no trigger, no cron. Live: 13 closed deals, 0 commission_records.
2. **HIGH — Splits never flow into economics.** `EnrichedDeal` (`lib/pipeline.ts`) doesn't carry `commission_split_agent`; `DealDetail.tsx` computes economics client-side from hardcoded 10%/70% defaults; `listings.commission_split_agent`/`_brokerage` and `agency_members.commission_split` are NULL everywhere and never read.
3. **HIGH — No server-side amount computation + deal-blind manual entry.** No `purchase_price × fee_rate × split` anywhere server-side; the commissions UI (`app/dashboard/commissions/page.tsx`) never sends `dealId`, requires hand-typed amount/IDs, and has no idempotency. (Runner-up: `success_fee_records` table missing live — the only automation hook, `app/api/closing/route.ts`, silently no-ops.)
