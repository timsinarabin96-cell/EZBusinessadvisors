/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/sell (page is a client component,
// so metadata must live in the server-component layout).
export const metadata: Metadata = {
  title: 'Sell a Business — Free Valuation & Confidential Listing | Concord Deal Platform',
  description: 'Sell your business confidentially. Get a free broker valuation, list on a vetted marketplace, and reach qualified buyers — NDA-first, recast financials, SBA-ready.',
  alternates: { canonical: '/marketplace/sell' },
  openGraph: {
    title: 'Sell a Business — Concord Deal Platform',
    description: 'Free, no-obligation valuation and confidential listing for business owners.',
    url: '/marketplace/sell',
    type: 'website',
  },
}

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
