/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// lib/legalChecklist.ts — #4 configurable legal-doc gate (spec §2A / §5).
// -----------------------------------------------------------------------------
// The legal gate (Marketing Agreement, LLC Resolution + configurable list) is
// an EDITABLE per-agency checklist, not hardcoded. This module owns the
// defaults, validation and resolution. Publish enforces whatever the agency
// has configured — every tier, no exceptions (spec: a listing cannot go live
// without these regardless of paid/free/agent status).
// =============================================================================

export const LEGAL_DOC_IDS = [
  'marketing_agreement',
  'listing_agreement',
  'llc_resolution',
  'corp_resolution',
  'nda',
  'other',
] as const

export type LegalDocId = (typeof LEGAL_DOC_IDS)[number]

export interface LegalDocRequirement {
  id: LegalDocId
  label: string
  /** Doc categories in listing_documents that satisfy this requirement. */
  satisfiedBy: string[]
  /** Title regexes on generated docs (documents table) that satisfy it. */
  titleRe: RegExp
}

export const LEGAL_DOC_REQUIREMENTS: Record<LegalDocId, LegalDocRequirement> = {
  marketing_agreement: {
    id: 'marketing_agreement',
    label: 'Marketing Agreement',
    satisfiedBy: ['marketing_agreement', 'listing_agreement'],
    titleRe: /marketing agreement|listing agreement/i,
  },
  listing_agreement: {
    id: 'listing_agreement',
    label: 'Listing Agreement',
    satisfiedBy: ['listing_agreement', 'marketing_agreement'],
    titleRe: /listing agreement|marketing agreement/i,
  },
  llc_resolution: {
    id: 'llc_resolution',
    label: 'LLC Resolution',
    satisfiedBy: ['llc_resolution'],
    titleRe: /llc resolution|resolution/i,
  },
  corp_resolution: {
    id: 'corp_resolution',
    label: 'Corporation Resolution',
    satisfiedBy: ['corp_resolution'],
    titleRe: /corp(?:oration)? resolution|resolution/i,
  },
  nda: {
    id: 'nda',
    label: 'Non-Disclosure Agreement',
    satisfiedBy: ['nda'],
    titleRe: /non[- ]disclosure|nda/i,
  },
  other: {
    id: 'other',
    label: 'Other Required Document',
    satisfiedBy: ['other'],
    titleRe: /./,
  },
}

export const DEFAULT_LEGAL_CHECKLIST: LegalDocId[] = ['marketing_agreement', 'llc_resolution']

/** Normalize any stored checklist value to a safe list of known doc ids. */
export function normalizeLegalChecklist(raw: unknown): LegalDocId[] {
  // Spec §5: the legal gate can never be emptied to zero — always keep the
  // two mandatory defaults at minimum. Defaults come FIRST for a stable order.
  const result: LegalDocId[] = [...DEFAULT_LEGAL_CHECKLIST]
  const seen = new Set<LegalDocId>(DEFAULT_LEGAL_CHECKLIST)
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const id = String(item).trim() as LegalDocId
      if ((LEGAL_DOC_IDS as readonly string[]).includes(id) && !seen.has(id)) {
        seen.add(id)
        result.push(id)
      }
    }
  }
  return result
}

export function legalChecklistLabels(list: LegalDocId[]): string[] {
  return list.map((id) => LEGAL_DOC_REQUIREMENTS[id]?.label || id)
}

/**
 * Given a listing's on-file docs + generated docs, return which checklist
 * requirements are satisfied and which are still missing. Pure — the publish
 * gate calls this with the resolved agency checklist.
 */
export function evaluateLegalChecklist(
  checklist: LegalDocId[],
  uploadedDocs: { category?: string | null; body_text?: string | null }[],
  generatedDocs: { title?: string | null }[],
): { satisfied: LegalDocId[]; missing: LegalDocId[] } {
  const satisfied = new Set<LegalDocId>()
  const uploadedText = uploadedDocs.map((d) => `${d.category || ''} ${d.body_text || ''}`).join(' ')
  const generatedText = generatedDocs.map((d) => d.title || '').join(' ')

  for (const id of checklist) {
    const req = LEGAL_DOC_REQUIREMENTS[id]
    if (!req) continue
    const viaUpload = uploadedDocs.some((d) => req.satisfiedBy.includes(d.category || ''))
    const viaText = req.titleRe.test(uploadedText) || req.titleRe.test(generatedText)
    if (viaUpload || viaText) satisfied.add(id)
  }

  return {
    satisfied: [...satisfied],
    missing: checklist.filter((id) => !satisfied.has(id)),
  }
}
