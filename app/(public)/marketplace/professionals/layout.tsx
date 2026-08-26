/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'

// Route-level metadata for /marketplace/professionals (client-component page).
export const metadata: Metadata = {
  title: 'Deal Professionals — Attorneys, CPAs, Lenders | Concord Deal Platform',
  description: 'A trusted network of business attorneys, CPAs, lenders, and consultants who help buyers and sellers close deals smoothly.',
  alternates: { canonical: '/marketplace/professionals' },
  openGraph: {
    title: 'Deal Professionals — Concord Deal Platform',
    description: 'Attorneys, CPAs, lenders, and consultants ready to help close your deal.',
    url: '/marketplace/professionals',
    type: 'website',
  },
}

export default function ProfessionalsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
