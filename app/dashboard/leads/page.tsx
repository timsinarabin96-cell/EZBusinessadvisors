'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import LeadsDashboard from '@/components/leads/LeadsDashboard'

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageInner />
    </Suspense>
  )
}

function LeadsPageInner() {
  const params = useSearchParams()
  const initialQuery = params.get('q') || ''
  return <LeadsDashboard initialQuery={initialQuery} />
}
