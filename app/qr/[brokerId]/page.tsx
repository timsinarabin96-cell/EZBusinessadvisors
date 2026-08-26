/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useParams } from 'next/navigation'
import QrScanPage from '@/components/cards/QrScanPage'

// QR scan destination — opened when a card's QR is scanned. No auth required;
// renders contact info with one-click save-to-contacts (vCard).
export default function QrPage() {
  const params = useParams()
  const brokerId = String(params?.brokerId || '')
  return <QrScanPage brokerId={brokerId} />
}
