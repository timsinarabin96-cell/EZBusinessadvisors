/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Backfill: migrate GENERATED documents (BOV/CIM/BLI/recast) out of the
// PRIVATE financial_docs bucket into the PUBLIC documents bucket so their
// stored URLs are directly openable (fixes the "Bucket not found" 404).
//
// Source financials (tax returns, P&L, bank statements) intentionally STAY in
// the private bucket — they're served via signed URLs at view time.
//
// Run: node scripts/backfill-generated-docs.mjs
// Idempotent: skips rows already pointing at the public documents bucket.
// =============================================================================

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const unquote = (s) => (s ?? '').trim().replace(/^"|"$/g, '')
const url = unquote(readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1])
const key = unquote(readFileSync('.env.local', 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m)?.[1])
if (!url || !key) throw new Error('Supabase env vars missing from .env.local')

const db = createClient(url, key, { auth: { persistSession: false } })
const FROM_BUCKET = 'financial_docs'
const TO_BUCKET = 'documents'

const { data: rows, error } = await db
  .from('financial_documents')
  .select('id, file_name, file_url, storage_path')
  .eq('category', 'generated_document')
  .not('storage_path', 'is', null)

if (error) throw new Error(`fetch rows: ${error.message}`)
console.log(`Found ${rows?.length || 0} generated_document rows to check`)

let migrated = 0
let skipped = 0
let failed = 0

for (const row of rows || []) {
  try {
    // Already public? (documents bucket URL)
    if (row.file_url && row.file_url.includes(`/object/public/${TO_BUCKET}/`)) {
      skipped++
      continue
    }
    if (!row.storage_path) {
      skipped++
      continue
    }

    // Download from private bucket.
    const { data: blob, error: dlErr } = await db.storage.from(FROM_BUCKET).download(row.storage_path)
    if (dlErr || !blob) {
      console.log(`  ⚠️ download failed ${row.file_name}: ${dlErr?.message || 'no blob'}`)
      failed++
      continue
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // Upload to public bucket (same path).
    const { error: upErr } = await db.storage.from(TO_BUCKET).upload(row.storage_path, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (upErr) {
      console.log(`  ⚠️ upload failed ${row.file_name}: ${upErr.message}`)
      failed++
      continue
    }

    const { data: urlData } = db.storage.from(TO_BUCKET).getPublicUrl(row.storage_path)
    const publicUrl = urlData?.publicUrl || ''

    const { error: updErr } = await db
      .from('financial_documents')
      .update({ file_url: publicUrl })
      .eq('id', row.id)
    if (updErr) {
      console.log(`  ⚠️ db update failed ${row.file_name}: ${updErr.message}`)
      failed++
      continue
    }

    // Best-effort cleanup of the private copy.
    await db.storage.from(FROM_BUCKET).remove([row.storage_path]).catch(() => {})
    migrated++
    console.log(`  ✅ ${row.file_name}`)
  } catch (e) {
    console.log(`  ⚠️ error ${row.file_name}: ${e?.message || e}`)
    failed++
  }
}

console.log(`\nDone. migrated=${migrated} skipped=${skipped} failed=${failed}`)
