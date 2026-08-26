/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useParams } from 'next/navigation'
import TrainingLessonView from '@/components/training/TrainingLesson'

export default function TrainingLessonPage() {
  const params = useParams()
  const moduleId = String(params?.moduleId || '')
  const lessonId = String(params?.lessonId || '')
  return <TrainingLessonView moduleId={moduleId} lessonId={lessonId} />
}
