/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Migration Runner (boss 08-31 lesson: the force-audit SQL was written but
// NEVER applied to the live DB — no migration runner existed). This script:
//   1. Scans sql/*.sql for pending migrations (version = filename stem).
//   2. Tracks applied versions in public.schema_migrations (already exists).
//   3. Applies pending SQL through the Supabase Management API (same path used
//      to rescue the force-audit migration), then records the version.
//   4. `--check` = dry run (default); `--apply` = execute pending migrations.
// Idempotent: a version already recorded in schema_migrations is never re-run.
//
// Usage:
//   node scripts/migrate.mjs                 # check only (default, safe)
//   node scripts/migrate.mjs --apply         # apply pending migrations
//   node scripts/migrate.mjs --apply --only <stem>   # apply one migration
//
// Env: SUPABASE_ACCESS_TOKEN (Management API), SUPABASE_PROJECT_REF.
// =============================================================================

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL_DIR = join(process.cwd(), 'sql')
const REF = process.env.SUPABASE_PROJECT_REF || process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+\.supabase\.co)/)?.[1] || 'ytcvlvisufxmmzeblmwx'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN || ''
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`

// Full-schema dumps / foundation files — NOT incremental migrations. They are
// applied once when provisioning a fresh project (scripts/provision-white-label)
// and must never be re-run against a live DB by --apply.
const IGNORE_FILES = new Set([
  'base_schema.sql',
  'brokerage_operating_system_foundation.sql',
  'core_agency_isolation.sql',
])

async function managementQuery(sql) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function appliedVersions() {
  try {
    const rows = await managementQuery("select version from public.schema_migrations order by version")
    return new Set((rows || []).map((r) => String(r.version)))
  } catch (e) {
    // No table yet (fresh DB) — nothing applied.
    console.warn(`[migrate] schema_migrations not readable (${e.message.slice(0, 80)}) — treating as empty`)
    return new Set()
  }
}

function pendingMigrations(applied) {
  return readdirSync(SQL_DIR)
    .filter((f) => f.endsWith('.sql') && !IGNORE_FILES.has(f))
    .sort()
    .map((f) => ({ version: f.replace(/\.sql$/, ''), file: f, sql: readFileSync(join(SQL_DIR, f), 'utf8') }))
    .filter((m) => !applied.has(m.version))
}

export { appliedVersions, pendingMigrations }

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const onlyIdx = args.indexOf('--only')
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null

  if (!TOKEN) {
    console.error('[migrate] SUPABASE_ACCESS_TOKEN is required (Management API).')
    process.exit(1)
  }

  const applied = await appliedVersions()
  const pending = pendingMigrations(applied).filter((m) => !only || m.version === only || m.version.includes(only))
  console.log(`[migrate] ${applied.size} applied · ${pending.length} pending (${apply ? 'apply mode' : 'check mode'})`)

  if (!apply) {
    for (const m of pending) console.log(`  pending: ${m.file}`)
    console.log('[migrate] dry run — re-run with --apply to execute.')
    return
  }

  for (const m of pending) {
    console.log(`[migrate] applying ${m.file} …`)
    try {
      await managementQuery(m.sql)
      await managementQuery(
        `insert into public.schema_migrations (version, source) values ('${m.version.replace(/'/g, "''")}', 'sql/${m.file}') on conflict (version) do nothing`
      )
      console.log(`[migrate] ✅ ${m.file}`)
    } catch (e) {
      console.error(`[migrate] ❌ ${m.file} failed: ${e.message.slice(0, 200)}`)
      console.error('[migrate] stopped — fix and re-run (already-applied versions are skipped).')
      process.exit(1)
    }
  }
  console.log('[migrate] done.')
}

// Only run when executed directly (keeps exports importable for tests).
if (process.argv[1] && process.argv[1].endsWith('migrate.mjs')) {
  main().catch((e) => { console.error('[migrate] fatal:', e.message); process.exit(1) })
}
