/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/favorites (client-component page).
// User-specific saved listings — keep out of search results.
export const metadata: Metadata = {
  title: 'Saved Businesses — Your Favorites | Concord Deal Platform',
  description: 'Your saved businesses for sale — revisit, compare, and shortlist your favorite acquisition opportunities.',
  alternates: { canonical: '/marketplace/favorites' },
  robots: { index: false, follow: false },
}

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
