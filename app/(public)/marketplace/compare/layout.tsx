/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/compare (client-component page).
export const metadata: Metadata = {
  title: 'Compare Businesses for Sale Side-by-Side | Concord Deal Platform',
  description: 'Compare vetted businesses for sale side by side — price, revenue, SDE, multiple, and more — to shortlist the right acquisition.',
  alternates: { canonical: '/marketplace/compare' },
  openGraph: {
    title: 'Compare Businesses — Concord Deal Platform',
    description: 'Side-by-side comparison of vetted businesses for sale.',
    url: '/marketplace/compare',
    type: 'website',
  },
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
