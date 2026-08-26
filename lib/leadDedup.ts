/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// leadDedup — client-safe wrapper around the pure detection core.
// The dashboard imports this; tests hit leadDedupCore.ts directly.
export {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  findDuplicateGroups,
  findCrossKindPairs,
} from '@/lib/leadDedupCore.ts'
export type { DedupLead, DupGroup, CrossKindPair } from '@/lib/leadDedupCore.ts'
