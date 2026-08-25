'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createListing, updateListing, fetchListing } from '@/lib/listings'
import { startWorkflow } from '@/lib/workflow'
import { matchBuyerLeads, UnifiedLead } from '@/lib/leads2'
import MatchedBuyersModal from '@/components/leads/MatchedBuyersModal'
import { useToast } from '@/components/ui/Toast'
import MoneyInput from '@/components/ui/MoneyInput'
import { getStoredAccessToken, authHeaders } from '@/lib/authToken'
import GrammarCheckButton from './GrammarCheckButton'
import SuggestionInput from './SuggestionInput'
import ListingIntakeModal from './ListingIntakeModal'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'
import { pricePosition } from '@/lib/listingMarketContextCore.ts'
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

export default function IntelligentListingForm({ listingId: editListingId }: { listingId?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [section, setSection] = useState<SectionId>('identity')
  const [form, setForm] = useState<IntelligentListingInput>(EMPTY_INTELLIGENT_LISTING)
  const [busy, setBusy] = useState(false)
  const [matched, setMatched] = useState<UnifiedLead[] | null>(null)
  const [showIntake, setShowIntake] = useState(false)
  const [createdListingId, setCreatedListingId] = useState<string | null>(editListingId || null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>('')
  const readiness = useMemo(() => calculateListingReadiness(form), [form])

  // Edit mode: load the existing listing into the form.
  useEffect(() => {
    if (!editListingId) return
    fetchListing(editListingId).then((l) => {
      if (!l) return
      const meta = (l as any).ai_metadata || {}
      setForm((cur) => ({
        ...cur,
        business_name: l.business_name || '',
        headline: l.headline || '',
        industry: l.industry || '',
        sub_industry: l.sub_industry || '',
        location_general: l.location_general || '',
        description: l.description || '',
        asking_price: l.asking_price != null ? String(l.asking_price) : '',
        annual_revenue: l.annual_revenue != null ? String(l.annual_revenue) : '',
        sde: l.sde != null ? String(l.sde) : '',
        ebitda: l.ebitda != null ? String(l.ebitda) : '',
        inventory_value: l.inventory_value != null ? String(l.inventory_value) : '',
        ffe_value: l.ffe_value != null ? String(l.ffe_value) : '',
        established_year: l.established_year != null ? String(l.established_year) : '',
        employees_full_time: l.employees_full_time != null ? String(l.employees_full_time) : '',
        employees_part_time: l.employees_part_time != null ? String(l.employees_part_time) : '',
        owner_hours_weekly: l.owner_hours_weekly != null ? String(l.owner_hours_weekly) : '',
        reason_for_sale: l.reason_for_sale || '',
        growth_opportunities: l.growth_opportunities || '',
        competitive_advantages: l.competitive_advantages || '',
        customer_concentration: l.customer_concentration || '',
        facilities_summary: l.facilities_summary || '',
        lease_monthly: l.lease_monthly != null ? String(l.lease_monthly) : '',
        lease_expires_on: l.lease_expires_on || '',
        lease_square_feet: (l as any).lease_square_feet != null ? String((l as any).lease_square_feet) : '',
        real_estate_included: !!l.real_estate_included,
        ffe_included: !!(l as any).ffe_included,
        inventory_included: !!(l as any).inventory_included,
        goodwill_included: !!(l as any).goodwill_included,
        asset_sale: (l as any).asset_sale !== false,
        property_address: (l as any).property_address || '',
        property_city: (l as any).property_city || '',
        square_footage: (l as any).square_footage != null ? String((l as any).square_footage) : '',
        land_acres: (l as any).land_acres != null ? String((l as any).land_acres) : '',
        year_built: (l as any).year_built != null ? String((l as any).year_built) : '',
        property_value: (l as any).property_value != null ? String((l as any).property_value) : '',
        property_description: (l as any).property_description || '',
        seller_financing_available: !!l.seller_financing_available,
        financing_notes: (l as any).financing_notes || '',
        transition_support: l.transition_support || '',
        training_period_weeks: l.training_period_weeks != null ? String(l.training_period_weeks) : '',
        public_title: meta.public_title || '',
        public_summary: meta.public_summary || '',
        public_highlights: Array.isArray(meta.public_highlights) ? meta.public_highlights.join('\n') : '',
        video_url: meta.video_url || '',
        confidentiality_level: (l.confidentiality_level as IntelligentListingInput['confidentiality_level']) || 'anonymous',
        show_financials: !!meta.show_financials,
        seller_approval_reference: meta.seller_approval_reference || '',
        source: (l.intake_source as IntelligentListingInput['source']) || 'broker_manual',
      }))
      setSaveState('saved')
    }).catch(() => {})
  }, [editListingId])

  // Auto-save: debounce 1.2s after any change; create draft on first change.
  const persist = useCallback(async (next: IntelligentListingInput) => {
    const snapshot = JSON.stringify(next)
    if (snapshot === lastSaved.current) return
    setSaveState('saving')
    try {
      const insert = { ...buildListingInsert(next), ai_readiness_score: calculateListingReadiness(next).score }
      if (createdListingId) {
        await updateListing(createdListingId, insert)
      } else {
        const created = await createListing(insert)
        setCreatedListingId(created.id)
      }
      lastSaved.current = snapshot
      setSaveState('saved')
    } catch (e: any) {
      setSaveState('error')
      console.error('autosave failed', e)
    }
  }, [createdListingId])

  useEffect(() => {
    if (editListingId && !createdListingId) return // still loading
    if (form === EMPTY_INTELLIGENT_LISTING) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(form), 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const setValue = <Key extends keyof IntelligentListingInput>(key: Key, value: IntelligentListingInput[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  // Apply an AI intake draft onto the form (only known fields overwrite).
  const applyIntakeDraft = (draft: Record<string, string | boolean | number | null>) => {
    setForm((current) => {
      const next = { ...current }
      for (const [key, value] of Object.entries(draft)) {
        if (key in next && value !== undefined && value !== null && value !== '') {
          ;(next as Record<string, unknown>)[key] = value
        }
      }
      return next
    })
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
      const insert = { ...buildListingInsert(form), ai_readiness_score: readiness.score }
      let listingId = createdListingId
      if (listingId) {
        await updateListing(listingId, insert)
      } else {
        const listing = await createListing(insert)
        listingId = listing.id
        setCreatedListingId(listing.id)
      }
      if (!listingId) throw new Error('No listing id')
      const matches = await matchBuyerLeads(form.industry || null)
      if (matches.length) {
        setMatched(matches)
        setBusy(false)
        return
      }
      await startWorkflow(listingId)
      toast(editListingId ? 'Listing updated — continuing workflow' : 'AI-ready listing created — broker workflow started', 'success')
      router.push(`/dashboard/listings/${listingId}/workflow`)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to save listing', 'error')
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-navy" onClick={() => setShowIntake(true)} style={{ fontSize: 13 }}>✨ AI Intake</button>
            <ReadinessCard score={readiness.score} label={readiness.label} />
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: saveState === 'saved' ? '#16a34a' : saveState === 'error' ? '#b91c1c' : '#9a6700', minHeight: 16 }}>
            {saveState === 'saving' ? '⏳ Saving…' : saveState === 'saved' ? (editListingId ? '✓ Changes saved' : '✓ Draft auto-saved') : saveState === 'error' ? '⚠ Save failed — check connection' : ''}
          </div>
        </div>
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
          {section === 'financials' && <FinancialSection form={form} setValue={setValue} listingId={createdListingId} />}
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
          <MarketRadarCard form={form} />
          <div className="card" style={{ padding: 18, background: '#f4f8fc' }}>
            <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 8 }}>What happens next</div>
            {['Agent completes intake', 'Broker reviews compliance', 'Seller approves public fields', 'AI matches qualified buyers', 'Approved channels publish'].map((item, index) => <div key={item} style={{ display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.4, marginTop: 9 }}><span style={{ color: '#2563eb', fontWeight: 800 }}>{index + 1}</span><span>{item}</span></div>)}
          </div>
        </aside>
      </div>

      {matched && <MatchedBuyersModal matches={matched} listingIndustry={form.industry} onDone={finishMatching} />}
      {showIntake && <ListingIntakeModal onApply={applyIntakeDraft} onClose={() => setShowIntake(false)} />}
    </form>
  )
}

// Live market radar — shows the industry band + where the asking price sits.
function MarketRadarCard({ form }: { form: IntelligentListingInput }) {
  const band = bandForIndustry(form.industry, form.ebitda ? 'EBITDA' : 'SDE')
  const price = form.asking_price ? Number(form.asking_price.replace(/[$,]/g, '')) : null
  const sde = form.sde ? Number(form.sde.replace(/[$,]/g, '')) : null
  const ebitda = form.ebitda ? Number(form.ebitda.replace(/[$,]/g, '')) : null
  const pos = pricePosition(price, sde, ebitda, band)
  if (!band) return null
  return (
    <div className="card" style={{ padding: 18, background: '#fffdf7' }}>
      <div className="section-title">📈 Market check</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
        {band.industry} typically sells at{' '}
        <strong style={{ color: 'var(--navy)' }}>{band.min.toFixed(1)}–{band.max.toFixed(1)}× {band.basis}</strong>
      </div>
      {pos && pos.multiple != null ? (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: pos.position === 'within' ? '#e8f7ee' : pos.position === 'below' ? '#eff6ff' : '#fdf3e3', color: pos.position === 'within' ? '#166534' : pos.position === 'below' ? '#1d4ed8' : '#92400e' }}>
          Asking price = {pos.multiple.toFixed(1)}× {pos.basis} — {pos.position === 'within' ? 'in line with market' : pos.position === 'below' ? 'below the typical band (value play)' : 'above the typical band'}
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>Enter an asking price + SDE/EBITDA to see where it sits.</div>
      )}
    </div>
  )
}

function BusinessSection({ form, setValue }: SectionProps) {
  return <Section title="Business identity" subtitle="Private identity stays inside the CRM. Public positioning is entered separately before publication."><Grid>
    <Field label="Legal or operating business name *" span><input className="input" value={form.business_name} onChange={(event) => setValue('business_name', event.target.value)} placeholder="Private CRM identity" /></Field>
    <Field label="Internal marketing headline"><input className="input" value={form.headline} onChange={(event) => setValue('headline', event.target.value)} placeholder="Established recurring-revenue service company" /></Field>
    <Field label="Year established"><input className="input" inputMode="numeric" value={form.established_year} onChange={(event) => setValue('established_year', event.target.value)} placeholder="2012" /></Field>
    <Field label="Primary industry"><SuggestionInput type="category" value={form.industry} onChange={(v) => setValue('industry', v)} placeholder="Business Services" /></Field>
    <Field label="Sub-industry"><SuggestionInput type="category" value={form.sub_industry} onChange={(v) => setValue('sub_industry', v)} placeholder="Commercial cleaning" /></Field>
    <Field label="General market area" span><SuggestionInput type="location" value={form.location_general} onChange={(v) => setValue('location_general', v)} placeholder="Greater Philadelphia, PA — never enter the exact public address here" /></Field>
    <Field label="Complete confidential description" span><textarea className="textarea" rows={8} value={form.description} onChange={(event) => setValue('description', event.target.value)} placeholder="Explain the business model, customers, services, history, operations, recurring revenue, differentiators, and why the opportunity matters." /><GrammarCheckButton kind="description" text={form.description} onApply={(corrected) => setValue('description', corrected)} /></Field>
  </Grid></Section>
}

function FinancialSection({ form, setValue, listingId }: SectionProps & { listingId?: string | null }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)

  const importFinancials = async (file: File) => {
    if (importing) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (listingId) fd.append('listingId', listingId)
      const res = await fetch('/api/listings/financial-import', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Import failed')
      const f = j.financials || {}
      if (f.latestYearRevenue != null) setValue('annual_revenue', String(f.latestYearRevenue))
      if (f.sde != null) setValue('sde', String(f.sde))
      if (f.ebitda != null) setValue('ebitda', String(f.ebitda))
      const parts = [`Extracted from ${file.name}`]
      if (f.sde != null) parts.push(`SDE $${Math.round(Number(f.sde)).toLocaleString()}`)
      if (f.ebitda != null) parts.push(`EBITDA $${Math.round(Number(f.ebitda)).toLocaleString()}`)
      if (f.latestYearRevenue != null) parts.push(`Revenue $${Math.round(Number(f.latestYearRevenue)).toLocaleString()}`)
      toast(parts.join(' · ') + ' — review before saving', 'success')
      if (f.summary) toast(f.summary.slice(0, 160), 'info')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return <Section title="Financial profile" subtitle="These values remain private unless a seller-approved public disclosure explicitly allows them.">
    <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f4f8fc', border: '1px solid #dbe7f3', borderRadius: 10, fontSize: 12.5, color: '#1e3a5f' }}>
      <strong>📄 Import financials:</strong> upload a P&L, tax return, bank statement or CSV — the AI extracts revenue, SDE and EBITDA automatically.
      <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} style={{ marginLeft: 10, padding: '5px 12px', borderRadius: 7, background: '#2563eb', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: importing ? 'wait' : 'pointer' }}>
        {importing ? 'Analyzing…' : 'Choose file'}
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls,.png,.jpg" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFinancials(f) }} />
    </div><Grid>
    <MoneyField label="Asking price" value={form.asking_price} onChange={(value) => setValue('asking_price', value)} />
    <MoneyField label="Annual revenue" value={form.annual_revenue} onChange={(value) => setValue('annual_revenue', value)} />
    <MoneyField label="Seller discretionary earnings" value={form.sde} onChange={(value) => setValue('sde', value)} />
    <MoneyField label="EBITDA" value={form.ebitda} onChange={(value) => setValue('ebitda', value)} />
    <MoneyField label="Inventory value" value={form.inventory_value} onChange={(value) => setValue('inventory_value', value)} />
    <MoneyField label="Furniture, fixtures & equipment" value={form.ffe_value} onChange={(value) => setValue('ffe_value', value)} />
    <MoneyField label="Monthly lease" value={form.lease_monthly} onChange={(value) => setValue('lease_monthly', value)} />
    <Field label="Lease expiration"><input className="input" type="date" value={form.lease_expires_on} onChange={(event) => setValue('lease_expires_on', event.target.value)} /></Field>
    <Checkbox label="Seller financing may be available" checked={form.seller_financing_available} onChange={(checked) => setValue('seller_financing_available', checked)} />
    <Checkbox label="FF&E (furniture, fixtures & equipment) is included in the sale" checked={form.ffe_included} onChange={(checked) => setValue('ffe_included', checked)} />
    <Checkbox label="Inventory is included in the sale" checked={form.inventory_included} onChange={(checked) => setValue('inventory_included', checked)} />
    <Checkbox label="Real estate may be included" checked={form.real_estate_included} onChange={(checked) => setValue('real_estate_included', checked)} />
    <Checkbox label="Sale includes goodwill (ongoing customer value)" checked={form.goodwill_included} onChange={(checked) => setValue('goodwill_included', checked)} />
    <Checkbox label="Structured as an asset sale" checked={form.asset_sale} onChange={(checked) => setValue('asset_sale', checked)} />
    <Field label="Financing structure and qualification notes" span><textarea className="textarea" rows={5} value={form.financing_notes} onChange={(event) => setValue('financing_notes', event.target.value)} placeholder="SBA suitability, down payment assumptions, seller note, working capital, collateral, or lender concerns." /></Field>
    {form.real_estate_included && (
      <div style={{ gridColumn: '1 / -1', padding: 16, borderRadius: 10, background: '#f8fbff', border: '1px solid #dbe7f3' }}>
        <div style={{ fontWeight: 800, color: 'var(--navy)', marginBottom: 14 }}>🏢 Property details (real estate included)</div>
        <Grid>
          <Field label="Property address"><input className="input" value={form.property_address} onChange={(event) => setValue('property_address', event.target.value)} placeholder="Street address (kept private)" /></Field>
          <Field label="Property city / state"><input className="input" value={form.property_city} onChange={(event) => setValue('property_city', event.target.value)} placeholder="City, ST" /></Field>
          <Field label="Building square footage"><input className="input" inputMode="numeric" value={form.square_footage} onChange={(event) => setValue('square_footage', event.target.value)} placeholder="e.g. 4800" /></Field>
          <Field label="Land (acres)"><input className="input" inputMode="decimal" value={form.land_acres} onChange={(event) => setValue('land_acres', event.target.value)} placeholder="e.g. 1.25" /></Field>
          <Field label="Year built"><input className="input" inputMode="numeric" value={form.year_built} onChange={(event) => setValue('year_built', event.target.value)} placeholder="e.g. 1998" /></Field>
          <MoneyField label="Property value" value={form.property_value} onChange={(value) => setValue('property_value', value)} />
          <Field label="Property description / notes" span><textarea className="textarea" rows={3} value={form.property_description} onChange={(event) => setValue('property_description', event.target.value)} placeholder="Condition, parking, expansion potential, leaseback options…" /></Field>
        </Grid>
      </div>
    )}
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
  const toast = useToast()
  const [drafting, setDrafting] = useState(false)

  const draftPublic = async () => {
    const context = [
      `Industry: ${form.industry || 'n/a'}`,
      `Sub-industry: ${form.sub_industry || 'n/a'}`,
      `Location: ${form.location_general || 'n/a'}`,
      `Description: ${form.description || 'n/a'}`,
      `Established: ${form.established_year || 'n/a'}`,
      `Employees: ${form.employees_full_time || 'n/a'} FT`,
      `Revenue: ${form.annual_revenue || 'n/a'}`,
      `SDE: ${form.sde || 'n/a'}`,
      `EBITDA: ${form.ebitda || 'n/a'}`,
      `Growth: ${form.growth_opportunities || 'n/a'}`,
      `Advantages: ${form.competitive_advantages || 'n/a'}`,
      `Show financials publicly: ${form.show_financials ? 'yes' : 'no'}`,
    ].join('\n')
    setDrafting(true)
    try {
      const res = await fetch('/api/listings/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ notes: context, mode: 'public' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) throw new Error(j.error || 'Draft failed')
      if (j.draft.public_title) setValue('public_title', j.draft.public_title)
      if (j.draft.public_summary) setValue('public_summary', j.draft.public_summary)
      if (j.draft.public_highlights) setValue('public_highlights', j.draft.public_highlights)
      if (typeof j.draft.show_financials === 'boolean') setValue('show_financials', j.draft.show_financials)
      toast('Drafted anonymous public preview — review before saving', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setDrafting(false)
    }
  }

  return <Section title="Seller-approved public preview" subtitle="Write a useful anonymous opportunity—not a copy of the private record. Never include the legal name, exact address, customer names, or identifying details."><div style={{ marginBottom: 14, padding: '12px 14px', background: '#f4f8fc', border: '1px solid #dbe7f3', borderRadius: 10, fontSize: 12.5, color: '#1e3a5f' }}>
      <strong>✨ One-click public draft:</strong> generate the anonymized title, summary and highlights from the private record — then edit.
      <button type="button" onClick={draftPublic} disabled={drafting} style={{ marginLeft: 10, padding: '5px 12px', borderRadius: 7, background: '#2563eb', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: drafting ? 'wait' : 'pointer' }}>
        {drafting ? 'Drafting…' : 'Draft public preview'}
      </button>
    </div><Grid>
    <Field label="Anonymous public title" span><input className="input" value={form.public_title} onChange={(event) => setValue('public_title', event.target.value)} placeholder="Recurring-Revenue Commercial Services Company" /></Field>
    <Field label="Public summary" span><textarea className="textarea" rows={7} value={form.public_summary} onChange={(event) => setValue('public_summary', event.target.value)} /><GrammarCheckButton kind="public_summary" text={form.public_summary} onApply={(corrected) => setValue('public_summary', corrected)} /></Field>
    <Field label="Public highlights — one per line" span><textarea className="textarea" rows={7} value={form.public_highlights} onChange={(event) => setValue('public_highlights', event.target.value)} placeholder={'High percentage of recurring revenue\nExperienced management team\nSeller transition support available'} /><GrammarCheckButton kind="highlights" text={form.public_highlights} onApply={(corrected) => setValue('public_highlights', corrected)} /></Field>
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
