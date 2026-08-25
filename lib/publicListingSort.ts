// =============================================================================
// publicListingSort — pure, dependency-free sort comparator for public
// listings. Lives in its own module (no @/ imports) so node unit tests can
// import it directly. lib/marketplace.ts re-exports it for the search engine.
// =============================================================================

export type PublicListingSortBy = 'newest' | 'price_asc' | 'price_desc' | 'revenue_desc' | 'multiple_desc'

export interface SortablePublicListing {
  asking_price?: number | null
  annual_revenue?: number | null
  sde?: number | null
  is_featured?: boolean | null
  created_at?: string | null
}

/**
 * Pure sort comparator for public listings.
 * Default: featured first, then most recently created.
 */
export function publicListingSorter(sortBy?: PublicListingSortBy) {
  return (a: SortablePublicListing, b: SortablePublicListing): number => {
    if (!sortBy || sortBy === 'newest') {
      const feat = Number(b.is_featured) - Number(a.is_featured)
      if (feat !== 0) return feat
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    }
    switch (sortBy) {
      case 'price_asc':
        return (a.asking_price ?? Number.MAX_SAFE_INTEGER) - (b.asking_price ?? Number.MAX_SAFE_INTEGER)
      case 'price_desc':
        return (b.asking_price ?? 0) - (a.asking_price ?? 0)
      case 'revenue_desc':
        return (b.annual_revenue ?? 0) - (a.annual_revenue ?? 0)
      case 'multiple_desc': {
        const ma = a.asking_price != null && a.sde != null && a.sde > 0 ? a.asking_price / a.sde : 0
        const mb = b.asking_price != null && b.sde != null && b.sde > 0 ? b.asking_price / b.sde : 0
        return mb - ma
      }
      default:
        return 0
    }
  }
}
