/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// listingPipeline — auto-advance: the listing flow pulls itself forward.
// When a step completes, downstream documents generate automatically instead
// of waiting for a button click.
//   step 2 (financials) done → run Recast+BOV+CIM+BLI pipeline
//   step 3 (recast) done    → re-run pipeline (CIM/BLI pick up recast)
//   step 5 (CIM) done       → ensure BLI exists
// Fire-and-forget from the workflow page; the generate API is server-side.
// =============================================================================

import { getStoredAccessToken } from '@/lib/authToken'
import { fetchVersions } from '@/lib/workflow'

const GENERATE_URL = '/api/financial/generate'

async function hasVersion(listingId: string, table: 'bov_versions' | 'cim_versions' | 'bli_versions'): Promise<boolean> {
  try {
    const v = await fetchVersions(listingId, table)
    return v.length > 0
  } catch {
    return false
  }
}

/**
 * Trigger auto-generation for the documents unlocked by completing `step`.
 * Never throws — failures surface in the UI as a toast by the caller.
 */
export async function autoAdvance(listingId: string, step: number): Promise<string[]> {
  const notes: string[] = []
  const token = getStoredAccessToken()
  if (!token || !listingId) return notes

  try {
    const [hasBov, hasCim, hasBli] = await Promise.all([
      hasVersion(listingId, 'bov_versions'),
      hasVersion(listingId, 'cim_versions'),
      hasVersion(listingId, 'bli_versions'),
    ])

    // Step 2 unlocks the full financial doc pipeline; step 3 regenerates it
    // so CIM/BLI reflect the recast. Only fire when there is something new
    // to produce — don't hammer the API on every visit.
    const wantsPipeline = (step === 2 && (!hasBov || !hasCim || !hasBli)) || (step === 3 && !hasCim)
    if (wantsPipeline) {
      const res = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.ok) {
        notes.push(`Auto-generated ${(j.artifacts || []).length} document(s)`)
      } else {
        notes.push(`Auto-generation skipped: ${j.error || 'unknown error'}`)
      }
    } else if (step === 5 && !hasBli) {
      // BLI is cheap to produce on its own — fall back to the old helper.
      const { generateBLI } = await import('@/lib/workflow')
      const ok = await generateBLI(listingId)
      notes.push(ok ? 'Auto-generated BLI' : 'BLI generation failed')
    }
  } catch {
    notes.push('Auto-generation unavailable')
  }
  return notes
}
