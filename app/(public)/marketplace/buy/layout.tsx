/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/buy (page is a client component,
// so metadata must live in the server-component layout).
export const metadata: Metadata = {
  title: 'Buy a Business — Browse Vetted Businesses for Sale | Concord Deal Platform',
  description: "Tell us what you're looking for — industry, budget, location — and get matched with vetted, cash-flowing businesses for sale. Confidential, NDA-first process.",
  alternates: { canonical: '/marketplace/buy' },
  openGraph: {
    title: 'Buy a Business — Concord Deal Platform',
    description: 'Get matched with vetted, cash-flowing businesses for sale.',
    url: '/marketplace/buy',
    type: 'website',
  },
}

export default function BuyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
