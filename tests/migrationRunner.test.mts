/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Migration runner regression locks (boss 08-31 lesson: the force-audit SQL was
// written but never applied to the live DB — no migration runner existed).
// Locks the runner's safety contract: check-mode default, schema_migrations
// ledger, full-schema-dump exclusions, idempotent version tracking.
// =============================================================================

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const runner = readFileSync('scripts/migrate.mjs', 'utf8')

test('migrate: check mode is the safe default (--apply required to execute)', () => {
  assert.match(runner, /`--check` = dry run \(default\)/)
  assert.match(runner, /args\.includes\('--apply'\)/)
  assert.match(runner, /dry run — re-run with --apply to execute/)
})

test('migrate: tracks applied versions in schema_migrations', () => {
  assert.match(runner, /public\.schema_migrations/)
  assert.match(runner, /select version from public\.schema_migrations/)
  assert.match(runner, /insert into public\.schema_migrations \(version, source\)/)
  assert.match(runner, /on conflict \(version\) do nothing/)
})

test('migrate: full-schema dumps are excluded from --apply (never re-run on live)', () => {
  assert.match(runner, /IGNORE_FILES/)
  assert.match(runner, /'base_schema\.sql'/)
  assert.match(runner, /'brokerage_operating_system_foundation\.sql'/)
  assert.match(runner, /'core_agency_isolation\.sql'/)
  assert.match(runner, /!IGNORE_FILES\.has\(f\)/)
})

test('migrate: applies via Supabase Management API and records after success', () => {
  assert.match(runner, /api\.supabase\.com\/v1\/projects/)
  assert.match(runner, /applying \$\{m\.file\}/)
  assert.match(runner, /already-applied versions are skipped/)
})

test('migrate: pending scan is deterministic (sorted, idempotent per version)', () => {
  assert.match(runner, /\.endsWith\('\.sql'\)/)
  assert.match(runner, /\.sort\(\)/)
  assert.match(runner, /\.filter\(\(m\) => !applied\.has\(m\.version\)\)/)
})
