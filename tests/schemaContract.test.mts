/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Schema contract guard — the naming-drift tripwire.
//
// Every `.from('table')` in lib/ + app/api must resolve to a real table/view:
//   * live manifest snapshot  (tests/fixtures/known_tables.json)
//   * OR a CREATE TABLE/VIEW in sql/ or migrations/
//   * OR an explicit allowlist entry (storage buckets, dynamic names)
//
// This turns the "commissions vs commission_records" class of bug (silent 404s,
// empty analytics, dead features) into a hard CI failure on the next push.
// Update the manifest with:  python3 scripts/refresh_known_tables.py
// =============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/** Tables/views that legitimately don't live in Postgres `public` (storage buckets etc.). */
const ALLOWLIST = new Set([
  // Supabase Storage buckets (storage.from('...'))
  'broker_photos',
  'documents',
  'financial_docs',
  'listing_images',
  'profile_images',
  'training',
  // Dynamic / non-public-schema targets
  'auth',
  'storage',
])

function walk(dir: string): string[] {
  let out: string[] = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out = out.concat(walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

function knownTables(): Set<string> {
  const known = new Set<string>()
  try {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/known_tables.json'), 'utf8'))
    for (const t of manifest.tables || []) known.add(t)
  } catch {
    /* manifest missing — fall through to sql/ scan only */
  }
  // Also accept anything defined in sql/ or migrations/ (source of truth even
  // if the manifest snapshot is stale).
  for (const dir of ['sql', 'migrations']) {
    try {
      for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith('.sql'))) {
        const src = readFileSync(join(ROOT, dir, f), 'utf8')
        for (const m of src.matchAll(/create (?:or replace )?(?:table|view)\s+(?:if not exists\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
          known.add(m[1].toLowerCase())
        }
      }
    } catch { /* dir may not exist */ }
  }
  return known
}

test('schema contract: every .from() table reference resolves to a real table/view', () => {
  const known = knownTables()
  const offenders: string[] = []

  for (const dir of ['lib', 'app/api']) {
    for (const file of walk(join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8')
      // Skip comments and storage.from() — match .from('name') and .from("name")
      const cleaned = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      for (const m of cleaned.matchAll(/\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/gi)) {
        const table = m[1].toLowerCase()
        if (known.has(table) || ALLOWLIST.has(table)) continue
        offenders.push(`${file}: .from('${table}')`)
      }
    }
  }

  assert.ok(
    offenders.length === 0,
    `Dead table references (naming drift — fix code or add to manifest):\n${offenders.join('\n')}`,
  )
})

test('schema contract: known_tables manifest is not empty', () => {
  const known = knownTables()
  assert.ok(known.size > 100, `manifest suspiciously small: ${known.size} tables`)
})
