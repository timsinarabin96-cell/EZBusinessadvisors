/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useParams } from 'next/navigation'
import PublicCardView from '@/components/cards/PublicCardView'

// Public business card page — anyone with the link can view, save contact, and
// print. No auth required.
export default function CardPage() {
  const params = useParams()
  const brokerId = String(params?.brokerId || '')
  return <PublicCardView brokerId={brokerId} />
}
