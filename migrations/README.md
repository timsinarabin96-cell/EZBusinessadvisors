# Concord Deal Platform — Schema Migrations

Versioned, ordered SQL migrations. **New schema changes go here** — never
hand-edited against the live DB.

## Rules

1. **One file per change**, named `NNNN_description.sql` (zero-padded, ordered).
2. **Idempotent where possible** (`if not exists`, `on conflict do nothing`).
3. **Additive over destructive** — prefer `add column if not exists` over drops.
4. Run with: `migrations/run.sh` (applies pending in order, records in
   `public.schema_migrations`).
5. Never edit an applied migration — add a new one.

## Current state

- `0001_restore_fixes_2026_08_28.sql` — post-restore grants, auth trigger,
  listings status check, RLS, profile backfill.
- `0002_schema_drift_fix_2026_08_28.sql` — cim/bov_versions columns,
  listing_documents columns, certified_brokers view.

The older `sql/` files remain as the historical schema inventory (kept for
reference and rebuilds); `migrations/` is the forward path.

## CI

GitHub Actions runs `npx tsc --noEmit`, `npm test`, and `npm run build` on
every push (`.github/workflows/ci.yml`). A migration that breaks typecheck or
tests fails the build before it ever deploys.
