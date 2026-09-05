# Cross-Agency Isolation Audit — 2026-09-05

**Trigger:** Real listings going live within days; verify no agency can read another
agency's leads/listings/deals/documents through shared server code.

**Method:** Swept every `lib/` module that reads `buyer_leads`, `seller_leads`,
`listings`, `deals`, `deal_documents`, `saved_searches`, and `listing_nda_signatures`,
then classified by which Supabase client it uses (service-role = bypasses RLS, must
filter manually; anon = RLS-scoped, safe if policies are applied).

## Verdict: 1 genuine leak (FIXED), rest clean

| Module | Client | Agency-scoped? |
|---|---|---|
| `callerMatch.ts` | service-role | ✅ `.eq('agency_id', agencyId)` |
| `dailyBrief.ts` (buyers/sellers/deals/expirations) | service-role | ✅ scoped |
| `dailyBrief.ts` (NDA signatures) | service-role | ❌ **LEAK — FIXED** (see below) |
| `captainsBrief.ts` | service-role | ✅ scoped (all 5 queries) |
| `csvTools.ts` (CSV export) | service-role | ✅ `.eq('agency_id', agencyId)` |
| `followups.ts` | service-role | ✅ scoped |
| `staleDeals.ts` | service-role | ✅ scoped |
| `reminders.ts` (buyer lead fetch) | service-role | ✅ fetched by id from caller's deal |
| `usageEnforcement.ts` | service-role | ✅ scoped |
| `leads2.ts` / `search.ts` / `analytics.ts` | anon + RLS | ✅ RLS-gated (`is_agency_member`) |
| `claude/context.ts` lead context | anon + RLS | ✅ RLS-gated |
| `underwriting.ts` / `documentCounterSign.ts` | insert/update by deal context | ✅ |

## The leak

`lib/dailyBrief.ts` fetched recent NDA signatures with **no agency filter**:

```ts
svc.from('listing_nda_signatures')
  .select('buyer_name, buyer_email, created_at, listings(business_name)')
  .gte('created_at', sinceMidnight)
```

`listing_nda_signatures` has no `agency_id` column — ownership lives on the parent
`listings` row. Since `svc` is the service-role client, this returned **every
agency's NDA signers** into every agency's daily brief (cross-agency email exposure).

**Fix:** inner-join filter through the parent listing:

```ts
svc.from('listing_nda_signatures')
  .select('buyer_name, buyer_email, created_at, listings!inner(agency_id, business_name)')
  .eq('listings.agency_id', agencyId)
```

Typecheck passes. No schema change required.

## Verified-safe architecture (no action needed)

- `sql/core_agency_isolation.sql`: RLS on leads/listings/deals + `assign_listing_agency` /
  `assign_deal_agency` triggers auto-set `agency_id` on insert — every new row gets
  tagged even if a route forgets.
- Service-role modules consistently accept `agencyId: string` as first param and filter.
- `saved_searches` has its own per-user RLS policy (`auth.uid() = user_id`).

## Suggested follow-up (cheap insurance, pre-launch)

1. One-time SQL sweep for tables created without RLS that now hold agency data —
   run a query against `pg_policies` vs table list before the first real import.
2. Optional: add `agency_id` directly to `listing_nda_signatures` (denormalized,
   set by trigger) so future queries can't forget the join again.
