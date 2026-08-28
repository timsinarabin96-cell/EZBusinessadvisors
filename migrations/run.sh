#!/bin/bash
# =============================================================================
# Concord Deal Platform — versioned schema migration runner
# -----------------------------------------------------------------------------
# Applies migrations from migrations/ in filename order, tracking applied
# versions in the schema_migrations table so nothing runs twice and a fresh
# restore can replay the full history deterministically.
#
# Usage:
#   migrations/run.sh                     # apply all pending migrations
#   migrations/run.sh --dry-run           # list pending without applying
#   migrations/run.sh --status            # show applied vs pending
#
# Env (or defaults):
#   SUPABASE_DB_PASSWORD   DB password (else reads credentials file)
#   SUPABASE_PROJECT_REF   project ref (else reads credentials file)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$ROOT/migrations"

REF="${SUPABASE_PROJECT_REF:-$(cat /root/.openclaw/credentials/supabase-new-keys.json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["ref"])' 2>/dev/null || echo ytcvlvisufxmmzeblmwx)}"
PW="${SUPABASE_DB_PASSWORD:-$(cat /root/.openclaw/credentials/supabase-new-db-password 2>/dev/null || true)}"

PSQL=(psql -h aws-0-ca-central-1.pooler.supabase.com -p 5432 -U "postgres.${REF}" -d postgres -v ON_ERROR_STOP=1)
export PGPASSWORD="$PW"
export PGSSLMODE=require

mkdir -p "$MIG_DIR"

# Ensure tracking table exists
"${PSQL[@]}" -q -c "
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now(),
  source     text
);" >/dev/null 2>&1 || true

applied=$("${PSQL[@]}" -tAc "select version from public.schema_migrations order by version;" 2>/dev/null | sort)
pending=()
for f in "$MIG_DIR"/*.sql; do
  [ -e "$f" ] || continue
  v="$(basename "$f")"
  if ! echo "$applied" | grep -qx "$v"; then
    pending+=("$f")
  fi
done

case "${1:-}" in
  --status)
    echo "Applied: $(echo "$applied" | grep -c . || echo 0)"
    echo "Pending: ${#pending[@]}"
    for f in "${pending[@]:-}"; do echo "  pending: $(basename "$f")"; done
    exit 0
    ;;
  --dry-run)
    for f in "${pending[@]:-}"; do echo "would apply: $(basename "$f")"; done
    exit 0
    ;;
esac

if [ "${#pending[@]}" -eq 0 ]; then
  echo "No pending migrations."
  exit 0
fi

for f in "${pending[@]}"; do
  v="$(basename "$f")"
  echo "==> applying $v"
  if "${PSQL[@]}" -f "$f" >/dev/null; then
    "${PSQL[@]}" -q -c "insert into public.schema_migrations (version, source) values ('$v', '$(basename "$ROOT")');" >/dev/null
    echo "    applied OK"
  else
    echo "    FAILED — migration $v errored. Fix and re-run." >&2
    exit 1
  fi
done
echo "Done. $((${#pending[@]})) migration(s) applied."
