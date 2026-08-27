/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import StudioConcierge from '@/components/studio/StudioConcierge'
import IntelligentListingForm from '@/components/listings/IntelligentListingForm'
import WorkflowDashboard from '@/components/listings/WorkflowDashboard'
import WorkflowGuidance from '@/components/listings/WorkflowGuidance'
import ListingCopilot from '@/components/listings/ListingCopilot'
import ListingReadinessPanel from '@/components/listings/ListingReadinessPanel'
import PublishPanel from '@/components/listing/PublishPanel'
import { PipelineStatusCard, SellerApprovalCard, DealPulseCard, RiskCard, CompsCard, ValuationSliderCard, BuyerLeaderboardCard, SyndicationPackCard, OfferIntelligenceCard, AutoClosingDriveCard, VoiceIntakeCard, PhotoAICard, CompetitiveBoardCard, OfferCompareCard, ClosingRunwayCard, ClosingCostCard } from '@/components/studio/StudioInsights'
import BuyerPipelineBoard from '@/components/buyers/BuyerPipelineBoard'
import FollowUpLadderCard from '@/components/buyers/FollowUpLadderCard'
import PostCloseCard from '@/components/buyers/PostCloseCard'
import DealTimelineCard from '@/components/buyers/DealTimelineCard'
import StatusBadge from '@/components/listings/StatusBadge'
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
import { autoAdvance } from '@/lib/listingPipeline'
import { getWorkflow, startWorkflow, WORKFLOW_STEPS } from '@/lib/workflow'
import { fetchListing, fmtMoney } from '@/lib/listings'

// =============================================================================
// AIDealStudio — the ONE continuous canvas for the entire listing lifecycle.
// -----------------------------------------------------------------------------
// Four phases, no page jumps, AI as the conductor:
//   1. CAPTURE  — the listing studio (business → financials → ops → seller →
//                 photos → preview). Finish → advances IN-PLACE to Verify.
//   2. VERIFY   — the 10-step pipeline (legal → recast → BOV → CIM → BLI →
//                 SBA → publish) embedded in the same canvas.
//   3. GO LIVE  — seller approval + publish readiness + syndication.
//   4. SELL     — buyer management + closing.
// Layout: left phase rail · center canvas · right AI conductor rail.
// URL state: ?phase=capture|verify|golive|sell&listing=<id>&step=<n>
// =============================================================================

type Phase = 'capture' | 'verify' | 'golive' | 'sell'

const PHASES: Array<{ key: Phase; label: string; icon: string; desc: string }> = [
  { key: 'capture', label: 'Capture', icon: '📝', desc: 'Build the deal record' },
  { key: 'verify', label: 'Verify', icon: '🔍', desc: 'Legal, financials, valuation docs' },
  { key: 'golive', label: 'Go Live', icon: '🚀', desc: 'Approve, match, publish' },
  { key: 'sell', label: 'Sell & Close', icon: '🤝', desc: 'Buyers, offers, closing' },
]

export default function AIDealStudio() {
  const router = useRouter()
  const params = useSearchParams()
  const toast = useToast()

  const rawPhase = String(params.get('phase') || 'capture')
  const phase: Phase = PHASES.some((p) => p.key === rawPhase) ? (rawPhase as Phase) : 'capture'
  const listingId = String(params.get('listing') || '')
  const stepParam = Number(params.get('step') || '1')

  const [activeStep, setActiveStep] = useState(1)
  const [listing, setListing] = useState<any>(null)
  const [workflow, setWorkflow] = useState<any>(null)
  const [loading, setLoading] = useState(phase === 'capture' ? false : true)
  const [conciergeDraft, setConciergeDraft] = useState<Record<string, string | boolean | number | null> | null>(null)
  const [liveState, setLiveState] = useState<{ score: number; label: string; missing: string[]; industry: string; location: string; askingPrice: string; photoCount: number } | null>(null)
  const lastPush = useRef('')

  // Session persistence — refresh returns to the same studio position.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('dealstudio')
      if (saved) {
        const s = JSON.parse(saved)
        // Resume a draft listing (capture phase included) when the URL lost it.
        if (s?.listing && s.listing !== listingId) {
          const qs = new URLSearchParams()
          qs.set('phase', s.phase === 'capture' ? 'capture' : s.phase)
          qs.set('listing', s.listing)
          if (s.step) qs.set('step', String(s.step))
          router.replace(`/dashboard/studio?${qs.toString()}`)
        } else if (s?.phase && s.phase !== phase && (s.phase === 'capture' || s.listing)) {
          const qs = new URLSearchParams()
          qs.set('phase', s.phase)
          if (s.listing) qs.set('listing', s.listing)
          if (s.step) qs.set('step', String(s.step))
          router.replace(`/dashboard/studio?${qs.toString()}`)
        }
      }
    } catch { /* non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem('dealstudio', JSON.stringify({ phase, listing: listingId || null, step: activeStep }))
    } catch { /* non-fatal */ }
  }, [phase, listingId, activeStep])

  const go = useCallback((next: string) => {
    if (next === lastPush.current) return
    lastPush.current = next
    router.push(`/dashboard/studio${next}`)
  }, [router])

  const setPhase = useCallback((p: Phase, id?: string, step?: number) => {
    const qs = new URLSearchParams()
    qs.set('phase', p)
    if (id) qs.set('listing', id)
    if (step) qs.set('step', String(step))
    go(`?${qs.toString()}`)
  }, [go])

  // Load listing + workflow for non-capture phases.
  const loadDeal = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    const l = await fetchListing(id)
    const w = (await getWorkflow(id)) || (await startWorkflow(id))
    setListing(l)
    setWorkflow(w)
    setActiveStep(w?.current_step || Number(params.get('step')) || 1)
    setLoading(false)
  }, [params])

  useEffect(() => {
    if (phase === 'capture') { setListing(null); setWorkflow(null); setLoading(false); return }
    if (listingId) loadDeal(listingId)
  }, [phase, listingId, loadDeal])

  // After Capture completes → advance to Verify IN-PLACE (no page teleport).
  const handleCreated = useCallback((id: string) => {
    toast('Deal record captured — moving to verification', 'success')
    setPhase('verify', id, 1)
  }, [setPhase, toast])

  const goNext = async () => {
    const next = Math.min(10, activeStep + 1)
    setActiveStep(next)
    const notes = await autoAdvance(listingId, activeStep)
    if (notes.length) toast(notes.join(' · '), 'success')
    const w = await getWorkflow(listingId)
    setWorkflow(w)
  }

  const goStep = (s: number) => setActiveStep(s)
  const stepMeta = WORKFLOW_STEPS.find((s) => s.step === activeStep)
  const doneSteps = new Set<number>((workflow?.completed_steps || []).map(Number))

  const captureDone = useMemo(() => {
    const d = doneSteps
    return d.size > 0 || phase === 'golive' || phase === 'sell'
  }, [doneSteps, phase])

  const capturePct = liveState?.score ?? 0
  const verifyPct = doneSteps.size > 0 ? Math.round((doneSteps.size / 10) * 100) : 0
  const phasePct: Record<Phase, number> = { capture: capturePct, verify: verifyPct, golive: verifyPct >= 80 ? 100 : 60, sell: 0 }

  return (
    <ToastProvider>
      {/* ══ TOP: PHASE PROGRESS BAR ══ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 16px', flexWrap: 'wrap' }}>
        {PHASES.map((p, idx) => {
          const active = phase === p.key
          const done = idx < PHASES.findIndex((x) => x.key === phase)
          const pct = phasePct[p.key]
          return (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 140px', minWidth: 130 }}>
              <span style={{ fontSize: 15 }}>{done ? '✅' : p.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 800, color: active ? 'var(--navy)' : 'var(--muted)' }}>
                  <span>{p.label}</span>
                  {!done && <span style={{ color: active ? '#c9a84c' : '#b6bdc7' }}>{pct}%</span>}
                </div>
                <div style={{ height: 5, borderRadius: 99, background: '#e7edf4', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ width: `${done ? 100 : pct}%`, height: '100%', background: done ? '#22c55e' : 'linear-gradient(90deg,#1a1a2e,#c9a84c)', borderRadius: 99, transition: 'width .3s ease' }} />
                </div>
              </div>
              {idx < PHASES.length - 1 && <span style={{ color: '#d8d2c4', fontSize: 13 }}>›</span>}
            </div>
          )
        })}
      </div>

      <div className="studio-grid" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 300px', gap: 18, alignItems: 'start', padding: '8px 2px' }}>
        {/* ══ LEFT: PHASE RAIL ══ */}
        <aside className="studio-rail studio-rail-left" style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PHASES.map((p, idx) => {
            const active = phase === p.key
            const done = idx < PHASES.findIndex((x) => x.key === phase)
            return (
              <button
                key={p.key}
                onClick={() => {
                  if (p.key === 'capture') setPhase('capture')
                  else if (listingId) setPhase(p.key, listingId, 1)
                  else toast('Finish Capture first — it creates the deal record', 'info')
                }}
                style={{
                  width: '100%', textAlign: 'left', padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
                  border: active ? '1.5px solid #c9a84c' : '1px solid var(--line)',
                  background: active ? 'linear-gradient(135deg,#1a1a2e,#0f3460)' : '#fff',
                  color: active ? '#fff' : 'var(--navy)',
                  boxShadow: active ? '0 8px 24px rgba(15,52,96,0.18)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontFamily: 'Georgia, serif', fontSize: 14.5 }}>
                      {idx + 1}. {p.label} {done && '✅'}
                    </div>
                    <div style={{ fontSize: 11.5, color: active ? 'rgba(255,255,255,0.7)' : 'var(--muted)', marginTop: 2 }}>{p.desc}</div>
                  </div>
                </div>
              </button>
            )
          })}

          {/* Phase mini-status */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14, fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            {phase === 'capture' && 'Fill what you know — the record auto-saves and flows into verification.'}
            {phase === 'verify' && 'Docs generate as data arrives. AI flags what needs a human.'}
            {phase === 'golive' && 'Seller approval → AI buyer matching → publish to approved channels.'}
            {phase === 'sell' && 'Manage buyers, NDAs, offers, and the closing — all from here.'}
          </div>
        </aside>

        {/* ══ CENTER: ACTIVE PHASE CANVAS ══ */}
        <main className="studio-canvas" style={{ minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>
                AI Deal Studio · {PHASES.find((p) => p.key === phase)?.label}
              </div>
              <h1 style={{ margin: '6px 0 0', fontSize: 26, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>
                {listing?.business_name || 'Build the complete deal record'}
              </h1>
              {listing && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                  {listing.industry || 'Industry TBD'} · {listing.location_general || 'Location TBD'} · {listing.asking_price ? fmtMoney(listing.asking_price) : 'price TBD'} <StatusBadge status={listing?.status} />
                </p>
              )}
            </div>
            {listingId && (
              <button
                onClick={() => router.push(`/dashboard/listings/${listingId}/edit`)}
                style={{ padding: '9px 16px', background: 'transparent', color: 'var(--navy)', border: '1px solid #c9a84c', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                ✎ Edit details
              </button>
            )}
          </div>

          {/* ── PHASE 1: CAPTURE ── */}
          {phase === 'capture' && (
            <>
              <StudioConcierge onDraft={(draft) => setConciergeDraft(draft)} />
              <IntelligentListingForm
                listingId={listingId || undefined}
                externalDraft={conciergeDraft}
                onCreated={handleCreated}
                onDraftCreated={(id) => { if (!listingId) setPhase('capture', id, 1) }}
                onLiveState={setLiveState}
              />
            </>
          )}

          {/* ── PHASE 2: VERIFY ── */}
          {phase === 'verify' && (
            loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading deal record…</div>
            ) : !listing ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Deal not found.</div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <WorkflowDashboard currentStep={workflow?.current_step || activeStep} completedSteps={workflow?.completed_steps} onNavigate={goStep} listingId={listingId} />
                </div>
                <ListingReadinessPanel listingId={listingId} />
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
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
                </div>
              </>
            )
          )}

          {/* ── PHASE 3: GO LIVE ── */}
          {phase === 'golive' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: '#fff', borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>Go Live</div>
                <h2 style={{ margin: '8px 0', fontSize: 22, fontFamily: 'Georgia, serif' }}>Approve → Match → Publish</h2>
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
                  The deal record is verified. Get seller approval on the public fields, let AI match qualified buyers, then publish to your approved channels.
                </p>
              </div>
              {listingId ? (
                <>
                  {/* The real publish engine — readiness gate, publish + schedule, featured upsell */}
                  <PublishPanel listingId={listingId} businessName={listing?.business_name} />
                  <ListingReadinessPanel listingId={listingId} />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setPhase('verify', listingId, 8)} style={btnGhost}>📋 Back to Step 8</button>
                    <button onClick={() => setPhase('sell', listingId, 1)} style={btnGhost}>👥 Manage buyers →</button>
                  </div>
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Complete Capture first.</div>
              )}
            </div>
          )}

          {/* ── PHASE 4: SELL & CLOSE ── */}
          {phase === 'sell' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'linear-gradient(135deg,#0f3460,#1a3a6b)', color: '#fff', borderRadius: 14, padding: 22 }}>
                <div style={{ fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 800 }}>Sell & Close</div>
                <h2 style={{ margin: '8px 0', fontSize: 22, fontFamily: 'Georgia, serif' }}>Buyers, offers, closing</h2>
                <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
                  Manage buyer interest, NDAs, LOIs, and the closing — all from the same studio.
                </p>
              </div>
              {listingId ? (
                <>
                  <Step9BuyerManagement listingId={listingId} onNext={() => setPhase('sell', listingId, 10)} />
                  <Step10DealClosing listingId={listingId} onNext={() => toast('Deal closed 🎉', 'success')} />
                </>
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Complete Capture first.</div>
              )}
            </div>
          )}
        </main>

        {/* ══ RIGHT: AI CONDUCTOR RAIL ══ */}
        <aside className="studio-rail studio-rail-right" style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {phase === 'capture' && (
            <>
              {/* LIVE conductor — reacts as the broker types */}
              <VoiceIntakeCard onDraft={(d) => setConciergeDraft(d)} />
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>✨ Live readiness</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: liveState && liveState.score >= 70 ? '#166534' : liveState && liveState.score >= 40 ? '#9a6700' : '#b91c1c' }}>
                    {liveState?.score ?? 0}
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: '#e7edf4', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ width: `${liveState?.score ?? 0}%`, height: '100%', background: liveState && liveState.score >= 70 ? '#16a34a' : liveState && liveState.score >= 40 ? '#f59e0b' : '#ef4444', transition: 'width .3s ease' }} />
                </div>
                {liveState && liveState.missing.length > 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4 }}>Next best action:</div>
                    {liveState.missing.slice(0, 3).map((m) => <div key={m}>○ {m}</div>)}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ Ready — continue to Verify</div>
                )}
                {liveState?.industry && liveState.askingPrice && (
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, borderTop: '1px solid #edf0f3', paddingTop: 8 }}>
                    📈 Market check armed: {liveState.industry} — price ${liveState.askingPrice} · {liveState.location || 'location TBD'}
                  </div>
                )}
                {liveState && liveState.photoCount === 0 && (
                  <div style={{ fontSize: 11.5, color: '#9a6700', marginTop: 8 }}>📷 Add photos or generate a branded cover for best buyer response.</div>
                )}
              </div>
              <CompsCard industry={liveState?.industry} askingPrice={liveState?.askingPrice} />
              <ConductorCard title="📝 Capture" body="Paste what you know in the concierge above — or fill the sections. The record auto-saves and flows into verification." />
            </>
          )}

          {phase === 'verify' && listing && workflow && (
            <>
              <PipelineStatusCard listingId={listingId} businessName={listing?.business_name} />
              <ValuationSliderCard industry={listing?.industry} basis={(listing?.ebitda ? 'EBITDA' : 'SDE') as 'SDE' | 'EBITDA'} baseValue={Number(listing?.ebitda || listing?.sde) || null} />
              <PhotoAICard listingId={listingId} />
              <RiskCard listingId={listingId} />
              <WorkflowGuidance step={activeStep} stepLabel={stepMeta?.label || ''} listing={listing} workflow={workflow} doneSteps={doneSteps} />
              <ListingCopilot listingId={listingId} businessName={listing?.business_name} />
            </>
          )}

          {phase === 'golive' && (
            <>
              <SellerApprovalCard listingId={listingId} sellerApproved={!!listing?.seller_approved_at} approvalRef={listing?.seller_approval_reference} />
              <CompetitiveBoardCard listingId={listingId} enabled={!!listing?.competitive_board_enabled} />
              <BuyerLeaderboardCard industry={listing?.industry} />
              <SyndicationPackCard businessName={listing?.business_name} industry={listing?.industry} location={listing?.location_general} price={listing?.asking_price} summary={listing?.public_summary} />
              <DealPulseCard listingId={listingId} />
              <ConductorCard title="🚀 Next best action" body="Run the publish step (Step 8). It fires buyer-match alerts, seller/team emails, and the newspaper queue." />
            </>
          )}

          {phase === 'sell' && (
            <>
              <DealPulseCard listingId={listingId} />
              <OfferIntelligenceCard listingId={listingId} askingPrice={listing?.asking_price} />
              <OfferCompareCard listingId={listingId} askingPrice={listing?.asking_price} />
              <AutoClosingDriveCard />
              <ClosingRunwayCard />
              <ClosingCostCard purchasePrice={listing?.asking_price} />
              <FollowUpLadderCard />
              <PostCloseCard />
              <DealTimelineCard listingId={listingId} />
              <ConductorCard title="🤝 Next best action" body="Review buyer interest and NDAs first — then shortlist the primary buyer before any LOI or closing step." />
              <ConductorCard title="🏁 Closing" body="The closing step records milestones, escrow, and the success fee — everything flows to the commission tracker." />
            </>
          )}
        </aside>
      </div>
    </ToastProvider>
  )
}

function ConductorCard({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{body}</div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { padding: '11px 20px', borderRadius: 8, background: 'var(--navy)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { padding: '11px 20px', borderRadius: 8, background: '#fff', color: 'var(--navy)', border: '1px solid #c9a84c', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }
