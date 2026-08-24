'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createListing } from '@/lib/listings'
import { startWorkflow } from '@/lib/workflow'
import { matchBuyerLeads, UnifiedLead } from '@/lib/leads2'
import MatchedBuyersModal from '@/components/leads/MatchedBuyersModal'
import { useToast } from '@/components/ui/Toast'
import MoneyInput from '@/components/ui/MoneyInput'
import {
  buildListingInsert,
  calculateListingReadiness,
  EMPTY_INTELLIGENT_LISTING,
  IntelligentListingInput,
} from '@/lib/listingIntelligence'

type SectionId = 'identity' | 'financials' | 'operations' | 'transition' | 'public'

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'identity', label: 'Business', description: 'Identity, industry, location, and positioning' },
  { id: 'financials', label: 'Financials', description: 'Price, earnings, assets, and financing' },
  { id: 'operations', label: 'Operations', description: 'People, facilities, moat, and growth' },
  { id: 'transition', label: 'Seller & Deal', description: 'Motivation, support, confidentiality, and source' },
  { id: 'public', label: 'Public Preview', description: 'Anonymous seller-approved marketplace content' },
]

export default function IntelligentListingForm() {
  const router = useRouter()
  const toast = useToast()
  const [section, setSection] = useState<SectionId>('identity')
  const [form, setForm] = useState<IntelligentListingInput>(EMPTY_INTELLIGENT_LISTING)
  const [busy, setBusy] = useState(false)
  const [matched, setMatched] = useState<UnifiedLead[] | null>(null)
  const [createdListingId, setCreatedListingId] = useState<string | null>(null)
  const readiness = useMemo(() => calculateListingReadiness(form), [form])

  const setValue = <Key extends keyof IntelligentListingInput>(key: Key, value: IntelligentListingInput[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.business_name.trim()) {
      setSection('identity')
      toast('Business name is required', 'error')
      return
    }

    setBusy(true)
    try {
      const listing = await createListing({ ...buildListingInsert(form), ai_readiness_score: readiness.score })
      setCreatedListingId(listing.id)
      const matches = await matchBuyerLeads(form.industry || null)
      if (matches.length) {
        setMatched(matches)
        return
      }
      await startWorkflow(listing.id)
      toast('AI-ready listing created — broker workflow started', 'success')
      router.push(`/dashboard/listings/${listing.id}/workflow`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to create listing', 'error')
      setBusy(false)
    }
  }

  const finishMatching = async (goToWorkflow: boolean) => {
    if (!createdListingId) return
    setMatched(null)
    if (goToWorkflow) {
      try { await startWorkflow(createdListingId) } catch {}
      router.push(`/dashboard/listings/${createdListingId}/workflow`)
      return
    }
    router.push('/dashboard/listings')
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div className="section-title">AI Listing Studio</div>
          <h1 style={{ fontSize: 30, margin: '8px 0' }}>Build the complete deal record</h1>
          <p style={{ color: 'var(--muted)', margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
            Enter once, then reuse the trusted data for buyer matching, the phone agent, BOV/CIM/BLI, marketing, seller reports, the public marketplace, and approved external distribution.
          </p>
        </div>
        <ReadinessCard score={readiness.score} label={readiness.label} />
      </div>

      <div className="listing-studio-grid" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 280px', gap: 20, alignItems: 'start' }}>
        <aside className="card" style={{ padding: 10, position: 'sticky', top: 84 }}>
          {SECTIONS.map((item, index) => {
            const active = item.id === section
            return (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} style={{ width: '100%', textAlign: 'left', padding: '13px 12px', marginBottom: 4, borderRadius: 8, border: active ? '1px solid rgba(37,99,235,.28)' : '1px solid transparent', background: active ? '#eff6ff' : 'transparent', cursor: 'pointer', color: active ? '#0f3460' : 'var(--text)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center', background: active ? '#2563eb' : '#e8edf3', color: active ? '#fff' : '#52606d', fontSize: 12, fontWeight: 800 }}>{index + 1}</span>
                  <strong>{item.label}</strong>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '7px 0 0 33px', lineHeight: 1.4 }}>{item.description}</div>
              </button>
            )
          })}
        </aside>

        <section className="card" style={{ padding: 28, minHeight: 620 }}>
          {section === 'identity' && <BusinessSection form={form} setValue={setValue} />}
          {section === 'financials' && <FinancialSection form={form} setValue={setValue} />}
          {section === 'operations' && <OperationsSection form={form} setValue={setValue} />}
          {section === 'transition' && <TransitionSection form={form} setValue={setValue} />}
          {section === 'public' && <PublicSection form={form} setValue={setValue} />}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--line)', marginTop: 28, paddingTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={() => moveSection(section, -1, setSection)} disabled={section === SECTIONS[0].id}>Previous</button>
            {section === SECTIONS[SECTIONS.length - 1].id
              ? <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating trusted record…' : 'Create Draft & Start Review'}</button>
              : <button type="button" className="btn btn-navy" onClick={() => moveSection(section, 1, setSection)}>Continue</button>}
          </div>
        </section>

        <aside style={{ position: 'sticky', top: 84, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="section-title">AI Readiness</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 10 }}><strong style={{ fontSize: 34, color: readiness.score >= 70 ? '#166534' : '#9a6700' }}>{readiness.score}</strong><span style={{ color: 'var(--muted)' }}>/ 100</span></div>
            <div style={{ height: 8, borderRadius: 99, background: '#e7edf4', overflow: 'hidden', margin: '10px 0 14px' }}><div style={{ width: `${readiness.score}%`, height: '100%', background: readiness.score >= 70 ? '#16a34a' : '#f59e0b' }} /></div>
            <div style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>{readiness.label}</div>
            {readiness.missing.slice(0, 5).map((missingItem) => <div key={missingItem} style={{ fontSize: 12, color: 'var(--muted)', padding: '5px 0', borderTop: '1px solid #edf0f3' }}>○ {missingItem}</div>)}
          </div>
          <div className="card" style={{ padding: 18, background: '#f4f8fc' }}>
            <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>What happens next</div>
            {['Agent completes intake', 'Broker reviews compliance', 'Seller approves public fields', 'AI matches qualified buyers', 'Approved channels publish'].map((item, index) => <div key={item} style={{ display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.4, marginTop: 9 }}><span style={{ color: '#2563eb', fontWeight: 800 }}>{index + 1}</span><span>{item}</span></div>)}
          </div>
        </aside>
      </div>

      {matched && <MatchedBuyersModal matches={matched} listingIndustry={form.industry} onDone={finishMatching} />}
    </form>
  )
}

function BusinessSection({ form, setValue }: SectionProps) {
  return <Section title="Business identity" subtitle="Private identity stays inside the CRM. Public positioning is entered separately before publication."><Grid>
    <Field label="Legal or operating business name *" span><input className="input" value={form.business_name} onChange={(event) => setValue('business_name', event.target.value)} placeholder="Private CRM identity" /></Field>
    <Field label="Internal marketing headline"><input className="input" value={form.headline} onChange={(event) => setValue('headline', event.target.value)} placeholder="Established recurring-revenue service company" /></Field>
    <Field label="Year established"><input className="input" inputMode="numeric" value={form.established_year} onChange={(event) => setValue('established_year', event.target.value)} placeholder="2012" /></Field>
    <Field label="Primary industry"><input className="input" value={form.industry} onChange={(event) => setValue('industry', event.target.value)} placeholder="Business Services" /></Field>
    <Field label="Sub-industry"><input className="input" value={form.sub_industry} onChange={(event) => setValue('sub_industry', event.target.value)} placeholder="Commercial cleaning" /></Field>
    <Field label="General market area" span><input className="input" value={form.location_general} onChange={(event) => setValue('location_general', event.target.value)} placeholder="Greater Philadelphia, PA — never enter the exact public address here" /></Field>
    <Field label="Complete confidential description" span><textarea className="textarea" rows={8} value={form.description} onChange={(event) => setValue('description', event.target.value)} placeholder="Explain the business model, customers, services, history, operations, recurring revenue, differentiators, and why the opportunity matters." /></Field>
  </Grid></Section>
}

function FinancialSection({ form, setValue }: SectionProps) {
  return <Section title="Financial profile" subtitle="These values remain private unless a seller-approved public disclosure explicitly allows them."><Grid>
    <MoneyField label="Asking price" value={form.asking_price} onChange={(value) => setValue('asking_price', value)} />
    <MoneyField label="Annual revenue" value={form.annual_revenue} onChange={(value) => setValue('annual_revenue', value)} />
    <MoneyField label="Seller discretionary earnings" value={form.sde} onChange={(value) => setValue('sde', value)} />
    <MoneyField label="EBITDA" value={form.ebitda} onChange={(value) => setValue('ebitda', value)} />
    <MoneyField label="Inventory value" value={form.inventory_value} onChange={(value) => setValue('inventory_value', value)} />
    <MoneyField label="Furniture, fixtures & equipment" value={form.ffe_value} onChange={(value) => setValue('ffe_value', value)} />
    <MoneyField label="Monthly lease" value={form.lease_monthly} onChange={(value) => setValue('lease_monthly', value)} />
    <Field label="Lease expiration"><input className="input" type="date" value={form.lease_expires_on} onChange={(event) => setValue('lease_expires_on', event.target.value)} /></Field>
    <Checkbox label="Seller financing may be available" checked={form.seller_financing_available} onChange={(checked) => setValue('seller_financing_available', checked)} />
    <Checkbox label="Real estate may be included" checked={form.real_estate_included} onChange={(checked) => setValue('real_estate_included', checked)} />
    <Field label="Financing structure and qualification notes" span><textarea className="textarea" rows={5} value={form.financing_notes} onChange={(event) => setValue('financing_notes', event.target.value)} placeholder="SBA suitability, down payment assumptions, seller note, working capital, collateral, or lender concerns." /></Field>
  </Grid></Section>
}

function OperationsSection({ form, setValue }: SectionProps) {
  return <Section title="Operating intelligence" subtitle="This information powers the Deal Twin, buyer-fit explanations, valuation narrative, and acquisition-risk analysis."><Grid>
    <Field label="Full-time employees"><input className="input" inputMode="numeric" value={form.employees_full_time} onChange={(event) => setValue('employees_full_time', event.target.value)} /></Field>
    <Field label="Part-time employees"><input className="input" inputMode="numeric" value={form.employees_part_time} onChange={(event) => setValue('employees_part_time', event.target.value)} /></Field>
    <Field label="Owner hours per week"><input className="input" inputMode="numeric" value={form.owner_hours_weekly} onChange={(event) => setValue('owner_hours_weekly', event.target.value)} /></Field>
    <Field label="Customer concentration"><input className="input" value={form.customer_concentration} onChange={(event) => setValue('customer_concentration', event.target.value)} placeholder="Largest customer is 12% of revenue" /></Field>
    <Field label="Competitive advantages" span><textarea className="textarea" rows={5} value={form.competitive_advantages} onChange={(event) => setValue('competitive_advantages', event.target.value)} /></Field>
    <Field label="Growth opportunities" span><textarea className="textarea" rows={5} value={form.growth_opportunities} onChange={(event) => setValue('growth_opportunities', event.target.value)} /></Field>
    <Field label="Facilities and operating footprint" span><textarea className="textarea" rows={4} value={form.facilities_summary} onChange={(event) => setValue('facilities_summary', event.target.value)} /></Field>
  </Grid></Section>
}

function TransitionSection({ form, setValue }: SectionProps) {
  return <Section title="Seller and transaction" subtitle="Capture the real reason, handoff plan, confidentiality boundary, and intake source without exposing it publicly."><Grid>
    <Field label="Reason for sale" span><textarea className="textarea" rows={4} value={form.reason_for_sale} onChange={(event) => setValue('reason_for_sale', event.target.value)} /></Field>
    <Field label="Transition support" span><textarea className="textarea" rows={4} value={form.transition_support} onChange={(event) => setValue('transition_support', event.target.value)} /></Field>
    <Field label="Training period (weeks)"><input className="input" inputMode="numeric" value={form.training_period_weeks} onChange={(event) => setValue('training_period_weeks', event.target.value)} /></Field>
    <Field label="Intake source"><select className="select" value={form.source} onChange={(event) => setValue('source', event.target.value as IntelligentListingInput['source'])}><option value="broker_manual">Broker / advisor manual entry</option><option value="seller_self_service">Seller self-service</option><option value="ai_phone">AI phone intake</option><option value="import">Approved import</option></select></Field>
    <Field label="Confidentiality level"><select className="select" value={form.confidentiality_level} onChange={(event) => setValue('confidentiality_level', event.target.value as IntelligentListingInput['confidentiality_level'])}><option value="anonymous">Anonymous public teaser</option><option value="qualified_buyers">Qualified buyers only</option><option value="broker_only">Broker-only / off market</option></select></Field>
    <Field label="Seller approval reference"><input className="input" value={form.seller_approval_reference} onChange={(event) => setValue('seller_approval_reference', event.target.value)} placeholder="Agreement/envelope/document reference" /></Field>
  </Grid><div style={{ marginTop: 18, padding: 16, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 13, lineHeight: 1.55 }}>Creating this draft does not publish it. Broker review, jurisdictional compliance review, and documented seller approval remain separate required gates.</div></Section>
}

function PublicSection({ form, setValue }: SectionProps) {
  return <Section title="Seller-approved public preview" subtitle="Write a useful anonymous opportunity—not a copy of the private record. Never include the legal name, exact address, customer names, or identifying details."><Grid>
    <Field label="Anonymous public title" span><input className="input" value={form.public_title} onChange={(event) => setValue('public_title', event.target.value)} placeholder="Recurring-Revenue Commercial Services Company" /></Field>
    <Field label="Public summary" span><textarea className="textarea" rows={7} value={form.public_summary} onChange={(event) => setValue('public_summary', event.target.value)} /></Field>
    <Field label="Public highlights — one per line" span><textarea className="textarea" rows={7} value={form.public_highlights} onChange={(event) => setValue('public_highlights', event.target.value)} placeholder={'High percentage of recurring revenue\nExperienced management team\nSeller transition support available'} /></Field>
    <Field label="Walkthrough / promo video URL (YouTube, Vimeo, or .mp4)" span><input className="input" value={form.video_url} onChange={(event) => setValue('video_url', event.target.value)} placeholder="https://youtube.com/watch?v=… or https://…/walkthrough.mp4" /></Field>
    <Checkbox label="Seller approved public financial figures" checked={form.show_financials} onChange={(checked) => setValue('show_financials', checked)} />
  </Grid><div style={{ marginTop: 22, padding: 20, border: '1px solid #dbe7f3', background: '#f8fbff', borderRadius: 12 }}><div className="section-title">Marketplace preview</div><h3 style={{ fontSize: 22, margin: '9px 0 8px' }}>{form.public_title || 'Your anonymous public title appears here'}</h3><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>{[form.industry, form.sub_industry, form.location_general].filter(Boolean).map((item) => <span key={item} style={{ padding: '5px 9px', borderRadius: 999, background: '#e8f0f8', color: '#31536f', fontSize: 12 }}>{item}</span>)}</div><p style={{ margin: 0, color: '#52606d', lineHeight: 1.65 }}>{form.public_summary || 'The seller-approved summary will help buyers understand the opportunity before requesting confidential access.'}</p></div></Section>
}

interface SectionProps {
  form: IntelligentListingInput
  setValue: <Key extends keyof IntelligentListingInput>(key: Key, value: IntelligentListingInput[Key]) => void
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div><h2 style={{ fontSize: 24, margin: 0 }}>{title}</h2><p style={{ color: 'var(--muted)', lineHeight: 1.55, margin: '7px 0 24px' }}>{subtitle}</p>{children}</div>
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="wf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 20px' }}>{children}</div>
}

function Field({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return <label style={{ gridColumn: span ? '1 / -1' : undefined }}><span className="label">{label}</span>{children}</label>
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><MoneyInput value={value} onChange={onChange} /></Field>
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 42, fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={{ width: 18, height: 18, accentColor: '#2563eb' }} />{label}</label>
}

function ReadinessCard({ score, label }: { score: number; label: string }) {
  return <div style={{ minWidth: 150, padding: '13px 16px', borderRadius: 12, background: '#fff', border: '1px solid var(--line)', textAlign: 'right' }}><div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Record quality</div><strong style={{ color: score >= 70 ? '#166534' : '#9a6700', fontSize: 20 }}>{score}%</strong><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</div></div>
}

function moveSection(current: SectionId, direction: -1 | 1, setSection: (section: SectionId) => void) {
  const currentIndex = SECTIONS.findIndex((item) => item.id === current)
  const next = SECTIONS[currentIndex + direction]
  if (next) setSection(next.id)
}
