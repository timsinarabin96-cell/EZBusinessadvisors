'use client'

import { useParams } from 'next/navigation'
import TrainingLessonView from '@/components/training/TrainingLesson'

export default function TrainingLessonPage() {
  const params = useParams()
  const moduleId = String(params?.moduleId || '')
  const lessonId = String(params?.lessonId || '')
  return <TrainingLessonView moduleId={moduleId} lessonId={lessonId} />
}
