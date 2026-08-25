'use client'

import { WORKFLOW_STEPS } from '@/lib/workflow'

// =============================================================================
// WorkflowGuidance — AI-style coaching rail shown beside the active workflow
// step. Gives the agent: why the step matters, what to do, what it unlocks,
// a pro tip, a live listing pulse, and the full 10-step checklist.
// =============================================================================

const STEP_GUIDANCE: Record<number, { why: string; how: string; unlock: string; tip: string }> = {
  1: {
    why: 'The signed listing agreement is your legal authorization to market the business.',
    how: 'Upload the signed listing agreement (required) plus any disclosures. The step completes once the agreement is on file.',
    unlock: 'Unlocks Financial Details — the economics of the deal.',
    tip: 'Keep the exact public address and owner identity out of uploads unless the seller approved sharing them.',
  },
  2: {
    why: 'Revenue, SDE, EBITDA and asset figures drive valuation, buyer matching and lender readiness.',
    how: 'Enter the last 12 months of financials plus what is included in the sale (FF&E, inventory, goodwill).',
    unlock: 'Unlocks Recast Financials and BOV generation.',
    tip: 'If the deal is an asset sale, note it — it changes how buyers and lenders underwrite it.',
  },
  3: {
    why: 'Recasting normalizes owner perks and one-time costs so a buyer sees true earning power.',
    how: 'Add back discretionary expenses (owner salary above market, personal vehicles, one-time items) with notes.',
    unlock: 'Unlocks the CIM so buyers see a clean financial story.',
    tip: 'Every add-back needs a written note — lenders will ask for the backup.',
  },
  4: {
    why: 'The BOV is your defensible opinion of value — the anchor for the entire deal.',
    how: 'Review the auto-generated BOV from financials and market comps, then finalize it.',
    unlock: 'Unlocks the CIM narrative.',
    tip: 'If the BOV range looks off, double-check SDE and the recast entries first.',
  },
  5: {
    why: 'The CIM is the confidential document qualified buyers see after signing an NDA.',
    how: 'Generate the CIM, review the narrative, confirm it is anonymized and accurate.',
    unlock: 'Unlocks the BLI (marketing snapshot).',
    tip: 'Never include customer names, the exact address, or owner identity in the CIM.',
  },
  6: {
    why: 'The BLI is the shareable one-pager brokers send to buyers and other agents.',
    how: 'Generate and review the BLI; it mirrors the seller-approved public fields.',
    unlock: 'Unlocks SBA qualification and listing.',
    tip: 'Keep the headline benefit-driven: recurring revenue, growth, transition support.',
  },
  7: {
    why: 'SBA eligibility widens your buyer pool dramatically — most small-biz buyers finance.',
    how: 'Optional: run the SBA qualification check. If it qualifies, the badge appears on marketing.',
    unlock: 'Unlocks Listing — go to market with the SBA badge.',
    tip: 'Businesses under $10M value and under $5M revenue are the typical SBA sweet spot.',
  },
  8: {
    why: 'This is go-live: the listing publishes to your marketplace and approved channels.',
    how: 'Confirm public fields, seller approval, and status are ready, then list the business.',
    unlock: 'Unlocks Buyer Management — the deal starts generating interest.',
    tip: 'Withdraw the listing the moment it goes under contract to stop new inquiries.',
  },
  9: {
    why: 'Managing buyers well is where deals are won: NDA, financial proof, qualifications.',
    how: 'Review NDA requests, qualify buyers, and designate a primary buyer when ready.',
    unlock: 'Unlocks Deal Closing — LOI, contracts, and the finish line.',
    tip: 'Require financial proof before sharing the CIM — it filters tire-kickers instantly.',
  },
  10: {
    why: 'Closing converts the listing into a completed transaction.',
    how: 'Track the LOI, under-contract status, and closing milestones; update status as it moves.',
    unlock: 'Completes the workflow and moves the listing to sold.',
    tip: 'Keep the closing tracker updated — it feeds your commissions and reporting.',
  },
}

export default function WorkflowGuidance({
  step,
  stepLabel,
  listing,
  workflow,
  doneSteps,
}: {
  step: number
  stepLabel: string
  listing: any
  workflow: any
  doneSteps: Set<number>
}) {
  const g = STEP_GUIDANCE[step] || STEP_GUIDANCE[1]
  const readyScore = listing?.ai_readiness_score ?? null

  return (
    <aside style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 84 }}>
      {/* Step coach */}
      <div className="card" style={{ padding: 18, background: '#f4f8fc', border: '1px solid #dbe7f3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--navy)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: 800 }}>{step}</span>
          <strong style={{ color: 'var(--navy)', fontFamily: 'Georgia, serif', fontSize: 15 }}>{stepLabel}</strong>
        </div>
        <div style={{ fontSize: 12.5, color: '#52606d', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 8px' }}><strong>Why it matters:</strong> {g.why}</p>
          <p style={{ margin: '0 0 8px' }}><strong>What to do:</strong> {g.how}</p>
          <p style={{ margin: '0 0 8px', color: '#2563eb' }}>{g.unlock}</p>
          <p style={{ margin: 0, fontSize: 12, color: '#9a6700' }}>💡 {g.tip}</p>
        </div>
      </div>

      {/* Listing pulse */}
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title">Listing pulse</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', marginTop: 10, fontSize: 12.5 }}>
          <Pulse label="AI readiness" value={readyScore != null ? `${readyScore}%` : '—'} tone={readyScore != null && readyScore >= 70 ? 'green' : readyScore != null && readyScore >= 45 ? 'gold' : 'muted'} />
          <Pulse label="Steps done" value={`${doneSteps.size}/10`} tone={doneSteps.size >= 8 ? 'green' : 'muted'} />
          <Pulse label="Asking price" value={listing?.asking_price ? `$${Number(listing.asking_price).toLocaleString()}` : '—'} tone="muted" />
          <Pulse label="Revenue" value={listing?.annual_revenue ? `$${Number(listing.annual_revenue).toLocaleString()}` : '—'} tone="muted" />
        </div>
      </div>

      {/* Full checklist */}
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title">Flow checklist</div>
        <div style={{ marginTop: 10 }}>
          {WORKFLOW_STEPS.map((s) => {
            const done = doneSteps.has(s.step)
            const current = s.step === step
            return (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: '1px solid #eef1f4', fontSize: 12.5 }}>
                <span style={{ fontSize: 13 }}>{done ? '✅' : current ? '🔵' : '○'}</span>
                <span style={{ color: done ? '#15803d' : current ? 'var(--navy)' : 'var(--muted)', fontWeight: done || current ? 700 : 500 }}>{s.label}</span>
                {current && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb', fontWeight: 700 }}>NOW</span>}
              </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

function Pulse({ label, value, tone }: { label: string; value: string; tone: 'green' | 'gold' | 'muted' }) {
  const color = tone === 'green' ? '#166534' : tone === 'gold' ? '#9a6700' : 'var(--text)'
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e7edf3', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
