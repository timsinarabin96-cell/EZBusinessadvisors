'use client'

import { useParams } from 'next/navigation'
import TrainingModule from '@/components/training/TrainingModule'

export default function TrainingModulePage() {
  const params = useParams()
  const moduleId = String(params?.moduleId || '')
  return <TrainingModule moduleId={moduleId} />
}
