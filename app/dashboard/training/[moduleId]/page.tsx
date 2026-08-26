/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useParams } from 'next/navigation'
import TrainingModule from '@/components/training/TrainingModule'

export default function TrainingModulePage() {
  const params = useParams()
  const moduleId = String(params?.moduleId || '')
  return <TrainingModule moduleId={moduleId} />
}
