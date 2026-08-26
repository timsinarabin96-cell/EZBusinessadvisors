/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/brokers (client-component page).
export const metadata: Metadata = {
  title: 'Meet Our Business Brokers | Concord Deal Platform',
  description: 'Licensed business brokers and intermediaries who sell businesses confidentially — valuation, marketing, negotiation, and closing, all in one team.',
  alternates: { canonical: '/marketplace/brokers' },
  openGraph: {
    title: 'Meet Our Business Brokers — Concord Deal Platform',
    description: 'Experienced intermediaries who close deals, protected by NDA-first process.',
    url: '/marketplace/brokers',
    type: 'website',
  },
}

export default function BrokersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
