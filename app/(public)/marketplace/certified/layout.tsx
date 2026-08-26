/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/certified (client-component page).
export const metadata: Metadata = {
  title: 'Certified Business Intermediaries | Concord Deal Platform',
  description: 'Brokers who completed the full CBI training program — valuation science, recasting, ethics, and closing — with verifiable course-completion certificates.',
  alternates: { canonical: '/marketplace/certified' },
  openGraph: {
    title: 'Certified Business Intermediaries — Concord Deal Platform',
    description: 'Every broker on this roster earned a verifiable CBI certification.',
    url: '/marketplace/certified',
    type: 'website',
  },
}

export default function CertifiedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
