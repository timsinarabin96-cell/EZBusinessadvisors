'use client'

// ---------------------------------------------------------------------------
// /dashboard/listings/[id]/workflow — Guided Listing Workflow view.
// 10-step tracker + active step editor + AI guidance rail. Same navy/gold
// visual language as the listings list so the whole listing system feels
// like one surface. Step 9 (Buyer Management) is rendered here too.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import WorkflowDashboard from '@/components/listings/WorkflowDashboard'
import Step1LegalDocs from '@/components/listings/Step1LegalDocs'
import Step2FinancialDetails from '@/components/listings/Step2FinancialDetails'
import Step3RecastFinancial from '@/components/listings/Step3RecastFinancial'
import Step4GenerateBOV from '@/components/listings/Step4GenerateBOV'
import Step5GenerateCIM from '@/components/listings/Step5GenerateCIM'
import Step6GenerateBLI from '@/components/listings/Step6GenerateBLI'
import Step7SBAQualification from '@/components/listings/Step7SBAQualification'
import Step8ListBusiness from '@/components/listings/Step8ListBusiness'
import Step9BuyerManagement from '@/components/listings/Step9BuyerManagement'
import Step10DealClosing from '@/components/listings/Step10DealClosing'
import StatusBadge from '@/components/listings/StatusBadge'
import WorkflowGuidance from '@/components/listings/WorkflowGuidance'
import ListingReadinessPanel from '@/components/listings/ListingReadinessPanel'
import ListingCopilot from '@/components/listings/ListingCopilot'
import { autoAdvance } from '@/lib/listingPipeline'
import { getWorkflow, startWorkflow, WORKFLOW_STEPS } from '@/lib/workflow'
import { fetchListing, fmtMoney } from '@/lib/listings'

export default function WorkflowPage() {
  return (
    <AppShell active="Listings">
      <ToastProvider>
        <div style={{ maxWidth: 1240, margin: '0 auto' }}>
          <WorkflowBody />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function WorkflowBody() {
  const params = useParams()
  const router = useRouter()
  const listingId = String(params.id || '')
  const toast = useToast()

  const [listing, setListing] = useState<any>(null)
  const [workflow, setWorkflow] = useState<any>(null)
  const [activeStep, setActiveStep] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const l = await fetchListing(listingId)
    const w = (await getWorkflow(listingId)) || (await startWorkflow(listingId))
    setListing(l); setWorkflow(w); setActiveStep(w?.current_step || 1); setLoading(false)
  }, [listingId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading workflow…</div>
  if (!listing) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Listing not found.</div>

  const refresh = async () => {
    const w = await getWorkflow(listingId)
    setWorkflow(w)
    const l = await fetchListing(listingId)
    setListing(l)
  }

  const goNext = async () => {
    const next = Math.min(10, activeStep + 1)
    setActiveStep(next)
    refresh()
    // Auto-advance: completed step may unlock doc generation (BOV/CIM/BLI).
    const notes = await autoAdvance(listingId, activeStep)
    if (notes.length) toast(notes.join(' · '), 'success')
  }
  const goStep = (s: number) => setActiveStep(s)

  const stepMeta = WORKFLOW_STEPS.find((s) => s.step === activeStep)
  const doneSteps = new Set<number>((workflow?.completed_steps || []).map(Number))

  return (
    <div>
      {/* Header — same language as the listings list */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/dashboard/listings')} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer', color: 'var(--navy)' }}>←</button>
            <h1 style={{ margin: 0, fontSize: 24, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{listing?.business_name}</h1>
            <StatusBadge status={listing?.status} />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
            {listing?.industry || 'Industry TBD'} · {listing?.location_general || 'Location TBD'} · {listing?.asking_price ? fmtMoney(listing.asking_price) : 'price TBD'}
          </p>
        </div>
        <button onClick={() => router.push(`/dashboard/listings/${listingId}/edit`)} style={{ padding: '9px 16px', background: 'transparent', color: 'var(--navy)', border: '1px solid var(--gold)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
          ✎ Edit details (AI Studio)
        </button>
      </div>

      {/* Workflow tracker */}
      <div style={{ marginBottom: 18 }}>
        <WorkflowDashboard currentStep={workflow?.current_step || activeStep} completedSteps={workflow?.completed_steps} onNavigate={goStep} listingId={listingId} />
      </div>

      <ListingReadinessPanel listingId={listingId} />

      {/* Two-column: step editor + AI guidance rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 18, alignItems: 'start' }}>
        <div>
          {activeStep === 1 && <Step1LegalDocs listingId={listingId} onNext={goNext} />}
          {activeStep === 2 && <Step2FinancialDetails listingId={listingId} onNext={goNext} />}
          {activeStep === 3 && <Step3RecastFinancial listingId={listingId} onNext={goNext} />}
          {activeStep === 4 && <Step4GenerateBOV listingId={listingId} onNext={goNext} />}
          {activeStep === 5 && <Step5GenerateCIM listingId={listingId} onNext={goNext} />}
          {activeStep === 6 && <Step6GenerateBLI listingId={listingId} onNext={goNext} />}
          {activeStep === 7 && <Step7SBAQualification listingId={listingId} onNext={goNext} />}
          {activeStep === 8 && <Step8ListBusiness listingId={listingId} onNext={goNext} />}
          {activeStep === 9 && <Step9BuyerManagement listingId={listingId} onNext={goNext} />}
          {activeStep === 10 && <Step10DealClosing listingId={listingId} onNext={goNext} />}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <WorkflowGuidance
            step={activeStep}
            stepLabel={stepMeta?.label || ''}
            listing={listing}
            workflow={workflow}
            doneSteps={doneSteps}
          />
          <ListingCopilot listingId={listingId} businessName={listing?.business_name} />
        </div>
      </div>
    </div>
  )
}
