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
