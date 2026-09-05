# RLS Coverage Sweep — 2026-09-05

**Purpose:** Pre-import insurance. Confirm every table that can hold agency-scoped
data has Row Level Security enabled + policies, before real listings/buyers go in.

**Method:** Static sweep of the full SQL corpus (`sql/*.sql`):
1. Extract all `create table public.*` (177 tables)
2. Extract all `alter table public.* enable row level security` (case-insensitive —
   `base_schema.sql` writes it in UPPERCASE, `STABILIZE_FINAL.sql` in lowercase)
3. Cross-reference for tables with no RLS enable anywhere in the corpus
4. Cross-reference agency-data tables (files referencing `agency_id`) against the
   RLS list

## Result: CLEAN — 0 tables truly missing RLS

All 177 tables created in the corpus have RLS enabled in at least one migration.

### False alarm (parser artifact, no action)
`broker_photos`, `certified_brokers`, `profile_images` initially flagged because the
case-sensitive pass missed UPPERCASE statements. All three are RLS-enabled in
`STABILIZE_FINAL.sql` (broker_photos/profile_images also in `base_schema.sql`).

## One watch item (not a leak)

`certified_brokers` has RLS **enabled but no policies** in the corpus → deny-all.
That is *safe* (no cross-agency exposure) but means the table is currently
unreadable/unwritable by any client — if the "certified brokers" directory feature
is meant to be live, it needs policies. Confirm before launch whether it's used.

## Layered safety already in place
- `sql/core_agency_isolation.sql`: triggers auto-assign `agency_id` on insert for
  listings/deals, so untagged rows can't happen silently.
- Service-role modules take `agencyId` and filter every query (audited separately —
  see `audit/agency-isolation-2026-09-05.md`).
- Anon-client searches (`search.ts`, `analytics.ts`, agent context) are RLS-gated
  via `is_agency_member()`.

## Recommended (optional, pre-import)
1. If `certified_brokers` is a real feature, add owner/admin policies.
2. Live verification after next deploy: query `pg_policies` vs table list via the
   Supabase SQL editor — static sweep can't see tables created outside the repo.
