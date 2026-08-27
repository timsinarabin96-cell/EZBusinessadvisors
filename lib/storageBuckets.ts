/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/storageBuckets.ts — shared storage bucket name constants.
// -----------------------------------------------------------------------------
// No 'use client' / 'use server' directive on purpose: this file must be
// importable identically from both client components and server-only code
// (Route Handlers). Previously FF_BUCKET was exported only from
// lib/financialFiles.ts, which is marked 'use client' — when a server-only
// module (lib/autoGenerate.ts) imported it, Next.js's RSC bundler replaced
// the client module's exports with an opaque client-reference object, so
// FF_BUCKET silently resolved to `{}` on the server. Every storage upload in
// the auto-generation pipeline then failed with a misleading
// "Bucket name invalid" error — this was the root cause of that
// previously-unresolved production bug, not a stale deployment.
// =============================================================================

// Private bucket — financial documents (tax returns, P&L, bank statements,
// generated Recast/BOV/CIM/BLI PDFs) must never be publicly downloadable.
// Access is always via a short-lived signed URL, never a stored permanent
// public URL.
export const FF_BUCKET = 'financial_docs'

// --- Server-safe pure helpers (no client deps) ---------------------------------
// These live here so server-only modules never import from the 'use client'
// lib/financialFiles.ts (whose exports the RSC bundler replaces with opaque
// client references on the server — FF_BUCKET used to resolve to {} there,
// breaking every storage upload with "bucket name is invalid").

export type FileKind = 'pdf' | 'excel' | 'word' | 'image' | 'other'
export type FinancialCategory =
  | 'tax_return'
  | 'financial_statement'
  | 'bank_statement'
  | 'generated_document'
  | 'other'

export function fileKindOf(name: string): FileKind {
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel'
  if (['doc', 'docx'].includes(ext)) return 'word'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image'
  return 'other'
}

const TAX_RE = /tax|return|1040|1120|1120s|1065|k-1|k1|w-2|w2|1099/i
const BANK_RE = /(^|[^a-z])bank|[^a-z]account statement|statement of account/i
const FIN_STMT_RE = /p&l|pnl|profit\s*(and|&|\/)\s*loss|income statement|balance sheet|financial statement|trial balance/i
const GENERATED_RE = /cim|bov|recast|bli|business listing/i

export function autoTagCategory(fileName: string): FinancialCategory {
  const n = fileName.toLowerCase()
  if (TAX_RE.test(n)) return 'tax_return'
  if (BANK_RE.test(n)) return 'bank_statement'
  if (FIN_STMT_RE.test(n)) return 'financial_statement'
  if (GENERATED_RE.test(n)) return 'generated_document'
  return 'other'
}
