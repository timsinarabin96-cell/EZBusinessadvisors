/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

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
import DuplicateListingModal from './DuplicateListingModal'
import { checkListingDuplicates } from '@/lib/listingDedup'
import { listingImageFor, placeholderImageFor } from '@/lib/stockImages'
import type { ListingMatch } from '@/lib/listingDedup'
import BuyerDemandPanel from '@/components/public/BuyerDemandPanel'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'
import { pricePosition } from '@/lib/listingMarketContextCore.ts'
import { uploadListingImages, deleteListingImage } from '@/lib/supabase/listings'
import {
  buildListingInsert,
  calculateListingReadiness,
  EMPTY_INTELLIGENT_LISTING,
  IntelligentListingInput,
} from '@/lib/listingIntelligence'

type SectionId = 'identity' | 'financials' | 'operations' | 'transition' | 'media' | 'public'

// Crash-proof auto-save: the latest form snapshot lives in localStorage so a
// closed tab / failed request / refresh never loses broker work. On next mount
// we compare it to what was last persisted and offer a one-click Restore.
const DRAFT_LS_KEY = 'concord-listing-draft-v1'

interface DraftBackup { saved: string; form: IntelligentListingInput; at: number }

const SECTIONS: Array<{ id: SectionId; label: string; description: string }> = [
  { id: 'identity', label: 'Business', description: 'Identity, industry, location, and positioning' },
  { id: 'financials', label: 'Financials', description: 'Price, earnings, assets, and financing' },
  { id: 'operations', label: 'Operations', description: 'People, facilities, moat, and growth' },
  { id: 'transition', label: 'Seller & Deal', description: 'Motivation, support, confidentiality, and source' },
  { id: 'media', label: 'Photos & Video', description: 'Gallery images and walkthrough video' },
  { id: 'public', label: 'Public Preview', description: 'Anonymous seller-approved marketplace content' },
]

export default function IntelligentListingForm({ listingId: editListingId, onCreated, onPhaseDone, externalDraft, onLiveState, onDraftCreated }: { listingId?: string; onCreated?: (listingId: string) => void; onPhaseDone?: () => void; externalDraft?: Record<string, string | boolean | number | null> | null; onLiveState?: (s: { score: number; label: string; missing: string[]; industry: string; location: string; askingPrice: string; photoCount: number }) => void; onDraftCreated?: (id: string) => void }) {
  const router = useRouter()
  const toast = useToast()
  const [section, setSection] = useState<SectionId>('identity')
  const [form, setForm] = useState<IntelligentListingInput>(EMPTY_INTELLIGENT_LISTING)
  const [busy, setBusy] = useState(false)
  const [matched, setMatched] = useState<UnifiedLead[] | null>(null)
  const [showIntake, setShowIntake] = useState(false)
  const [dupes, setDupes] = useState<ListingMatch[] | null>(null)
  const [createdListingId, setCreatedListingId] = useState<string | null>(editListingId || null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [restoreCandidate, setRestoreCandidate] = useState<{ form: IntelligentListingInput; saved: string } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>('')
  const hydrated = useRef(false)
  const readiness = useMemo(() => calculateListingReadiness(form), [form])

  // Per-section completion — drives ✓ dots in the nav rail + the advance nudge.
  const sectionComplete: Record<SectionId, boolean> = useMemo(() => {
    const f = form as any
    return {
      identity: !!f.business_name?.trim() && !!f.industry?.trim() && !!f.location_general?.trim(),
      financials: !!f.asking_price && (!!f.annual_revenue || !!f.sde || !!f.ebitda),
      operations: !!f.employees_full_time || !!f.facilities_summary?.trim() || !!f.competitive_advantages?.trim(),
      transition: !!f.reason_for_sale?.trim() && !!f.transition_support?.trim(),
      media: (f.gallery_images?.length ?? 0) > 0 || !!f.video_url?.trim(),
      public: !!f.public_title?.trim() && !!f.public_summary?.trim(),
    }
  }, [form])
  const sectionsDone = SECTIONS.filter((s) => sectionComplete[s.id]).length

  // ── Missing-field guidance: what's missing + what to tap next ──────────────
  // Each section's key fields with human labels, so validation errors say
  // "fill X in Section Y, then tap Next" instead of a cryptic failure.
  const SECTION_FIELDS: Record<SectionId, Array<{ key: string; label: string }>> = {
    identity: [
      { key: 'business_name', label: 'Business name' },
      { key: 'industry', label: 'Industry' },
      { key: 'location_general', label: 'Location (region/state)' },
    ],
    financials: [
      { key: 'asking_price', label: 'Asking price' },
      { key: 'annual_revenue', label: 'Annual revenue' },
      { key: 'sde', label: 'SDE' },
    ],
    operations: [
      { key: 'employees_full_time', label: 'FT employees' },
      { key: 'facilities_summary', label: 'Facilities' },
      { key: 'competitive_advantages', label: 'Competitive advantages' },
    ],
    transition: [
      { key: 'reason_for_sale', label: 'Reason for sale' },
      { key: 'transition_support', label: 'Transition support' },
    ],
    media: [{ key: 'gallery_images', label: 'Photos' }],
    public: [
      { key: 'public_title', label: 'Anonymous public title' },
      { key: 'public_summary', label: 'Public summary' },
    ],
  }

  /** Human labels of missing fields in a section (for guidance messages). */
  const missingInSection = (sec: SectionId): string[] => {
    const f = form as any
    const out: string[] = []
    for (const field of SECTION_FIELDS[sec]) {
      const v = f[field.key]
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
      if (empty) out.push(field.label)
    }
    return out
  }

  /** First incomplete section (for routing the user to the right spot). */
  const firstIncompleteSection = (): SectionId | null => {
    for (const s of SECTIONS) if (!sectionComplete[s.id]) return s.id
    return null
  }

  // Live conductor feed: report readiness + key fields to the studio rail as
  // the broker types — the AI conductor reacts in real time.
  useEffect(() => {
    if (!onLiveState) return
    onLiveState({
      score: readiness.score,
      label: readiness.label,
      missing: readiness.missing.slice(0, 6),
      industry: form.industry || '',
      location: form.location_general || '',
      askingPrice: form.asking_price || '',
      photoCount: (form.gallery_images || []).length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readiness, form])

  // Edit mode: load the existing listing into the form.
  useEffect(() => {
    if (!editListingId) { hydrated.current = true; return }
    // Guard: if the form already has content (user typed / autosave created the
    // draft this session), never clobber it with a fetch. This prevents the
    // studio's URL-sync (onDraftCreated) from remounting the form mid-click.
    if (form.business_name.trim()) return
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
        commission_split_agent: typeof (l as any).commission_split_agent === 'number' ? (l as any).commission_split_agent : 50,
        commission_split_brokerage: typeof (l as any).commission_split_brokerage === 'number' ? (l as any).commission_split_brokerage : 50,
        transition_support: l.transition_support || '',
        training_period_weeks: l.training_period_weeks != null ? String(l.training_period_weeks) : '',
        public_title: meta.public_title || '',
        public_summary: meta.public_summary || '',
        public_highlights: Array.isArray(meta.public_highlights) ? meta.public_highlights.join('\n') : '',
        video_url: meta.video_url || '',
        gallery_images: Array.isArray((l as any).image_urls) ? (l as any).image_urls : [],
        contact_phone: (l as any).contact_phone || '',
        confidentiality_level: (l.confidentiality_level as IntelligentListingInput['confidentiality_level']) || 'anonymous',
        show_financials: !!meta.show_financials,
        seller_approval_reference: meta.seller_approval_reference || '',
        source: (l.intake_source as IntelligentListingInput['source']) || 'broker_manual',
      }))
      setSaveState('saved')
      hydrated.current = true
    }).catch(() => { hydrated.current = true })
  }, [editListingId])

  // Auto-save: debounce 1.2s after any change; create draft on first change.
  // IMPORTANT: status/review_stage are workflow-owned — never re-send them on
  // update, or a late auto-save would silently unpublish a live listing.
  const persist = useCallback(async (next: IntelligentListingInput) => {
    const snapshot = JSON.stringify(next)
    if (snapshot === lastSaved.current) return
    setSaveState('saving')
    try {
      const insert = { ...buildListingInsert(next), ai_readiness_score: calculateListingReadiness(next).score }
      if (createdListingId) {
        const { status: _status, review_stage: _review, ...editable } = insert
        await updateListing(createdListingId, editable)
      } else {
        const created = await createListing(insert)
        setCreatedListingId(created.id)
        onDraftCreated?.(created.id)
      }
      lastSaved.current = snapshot
      setSaveState('saved')
      // Persisted — mark the backup as in-sync so we never offer a stale Restore.
      writeDraftBackup(next, snapshot)
    } catch (e: any) {
      setSaveState('error')
      console.error('autosave failed', e)
    }
  }, [createdListingId])

  // ── Crash-proofing ────────────────────────────────────────────────────────
  // Write the latest snapshot to localStorage (cheap, sync). Kept separate from
  // the server save so a closed tab / failed request never loses the work.
  const writeDraftBackup = useCallback((f: IntelligentListingInput, savedSnapshot?: string) => {
    try {
      const backup: DraftBackup = {
        saved: savedSnapshot ?? lastSaved.current,
        form: f,
        at: Date.now(),
      }
      localStorage.setItem(DRAFT_LS_KEY, JSON.stringify(backup))
    } catch {
      /* storage full / private mode — server autosave still covers us */
    }
  }, [])

  // Manual save: flush any pending debounce and persist right now (slow
  // connections, "Save now" button, or just peace of mind).
  const saveNow = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (backupTimer.current) clearTimeout(backupTimer.current)
    if (form === EMPTY_INTELLIGENT_LISTING) return
    await persist(form)
  }, [form, persist])

  // Live save status in the browser tab title — brokers on another tab can
  // see "Saving…" / "✓ Saved" / "⚠ Unsaved" at a glance.
  const baseTitle = editListingId ? 'Edit Listing' : 'New Listing'
  useEffect(() => {
    const status =
      saveState === 'saving' ? '⏳ Saving…' :
      saveState === 'error' ? '⚠ Save failed' :
      saveState === 'saved' ? '✓ Saved' :
      restoreCandidate ? '💾 Unsaved draft' :
      ''
    document.title = status ? `${status} · ${baseTitle} · Concord` : `${baseTitle} · Concord`
    return () => { document.title = 'Concord Deal Platform' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, restoreCandidate])

  // Debounced backup write on every change (500ms) — the safety net.
  useEffect(() => {
    if (form === EMPTY_INTELLIGENT_LISTING) return
    if (backupTimer.current) clearTimeout(backupTimer.current)
    backupTimer.current = setTimeout(() => writeDraftBackup(form), 500)
    return () => { if (backupTimer.current) clearTimeout(backupTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // Flush the backup on tab close / background — the last-chance snapshot.
  useEffect(() => {
    const flush = () => writeDraftBackup(form)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', flush)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  // On mount: offer a Restore if the backup has unsaved changes vs. what was
  // last persisted. Waits for edit-mode hydration so we never clobber the fetch.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!hydrated.current) return
      try {
        const raw = localStorage.getItem(DRAFT_LS_KEY)
        if (!raw) return
        const backup = JSON.parse(raw) as DraftBackup
        if (!backup?.form || typeof backup.form !== 'object') return
        const current = JSON.stringify(backup.form)
        if (current === backup.saved) return // already on the server — nothing to restore
        if (current === JSON.stringify(EMPTY_INTELLIGENT_LISTING)) return
        setRestoreCandidate({ form: backup.form, saved: backup.saved })
      } catch {
        /* corrupted backup — ignore */
      }
    }, 900)
    return () => clearTimeout(t)
  }, [])

  const restoreDraft = () => {
    if (!restoreCandidate) return
    setForm(restoreCandidate.form)
    lastSaved.current = restoreCandidate.saved
    setRestoreCandidate(null)
    try { localStorage.removeItem(DRAFT_LS_KEY) } catch { /* ignore */ }
    toast('Draft restored — review and it will auto-save again.', 'success')
  }

  const discardDraft = () => {
    setRestoreCandidate(null)
    try { localStorage.removeItem(DRAFT_LS_KEY) } catch { /* ignore */ }
  }

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

  // Studio Concierge: when the AI draft arrives, fill the form LIVE.
  useEffect(() => {
    if (externalDraft && Object.keys(externalDraft).length > 0) {
      applyIntakeDraft(externalDraft)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDraft])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.business_name.trim()) {
      setSection('identity')
      toast('Business name is missing — type it in the Business section (first field), then tap Create again.', 'error')
      return
    }

    // Friendly missing-field guidance: say WHAT is missing + WHERE to tap next.
    const firstMissing = firstIncompleteSection()
    if (firstMissing && firstMissing !== 'media') {
      const missing = missingInSection(firstMissing)
      const secLabel = SECTIONS.find((s) => s.id === firstMissing)?.label || ''
      setSection(firstMissing)
      toast(
        missing.length
          ? `Almost there — add ${missing.join(', ')} in the ${secLabel} section, then tap Create again. (Or tap Continue to skip for now.)`
          : `Fill the ${secLabel} section, then tap Create again. (Or tap Continue to skip for now.)`,
        'error',
      )
      return
    }

    // Duplicate-listing guard: for a NEW listing, check for a likely twin
    // before creating — the broker can open it or continue anyway.
    if (!createdListingId) {
      try {
        const found = await checkListingDuplicates({
          business_name: form.business_name.trim(),
          industry: form.industry || null,
          location_general: form.location_general || null,
          asking_price: form.asking_price ? Number(form.asking_price.replace(/[$,]/g, '')) : null,
        })
        const strong = found.filter((m) => m.level === 'high' || (m.level === 'medium' && m.score >= 45))
        if (strong.length) {
          setDupes(strong)
          return // wait for the modal decision
        }
      } catch {
        // dedup is best-effort — never block creation on it
      }
    }

    await doCreate()
  }

  const doCreate = async () => {
    setBusy(true)
    try {
      const insert = { ...buildListingInsert(form), ai_readiness_score: readiness.score }
      let listingId = createdListingId
      if (listingId) {
        // Same guard as auto-save: never clobber workflow state on edit.
        const { status: _status, review_stage: _review, ...editable } = insert
        await updateListing(listingId, editable)
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
      // AI Deal Studio: stay in the same canvas — advance to Verify in-place.
      if (onCreated) {
        onCreated(listingId)
        onPhaseDone?.()
        return
      }
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
      // AI Deal Studio: advance in-place when hosted.
      if (onCreated) {
        onCreated(createdListingId)
        onPhaseDone?.()
        return
      }
      router.push(`/dashboard/listings/${createdListingId}/workflow`)
      return
    }
    router.push('/dashboard/listings')
  }

  return (
    <form onSubmit={submit}>
      {restoreCandidate && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18, padding: '13px 18px', borderRadius: 12, border: '1px solid #e0c37a', background: '#fffbea', fontSize: 13.5, fontWeight: 700, color: '#7a5b10' }}>
          <span>💾 We found an unsaved draft from a previous session.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={restoreDraft} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: '#c9a84c', fontWeight: 800, cursor: 'pointer' }}>Restore draft</button>
            <button type="button" onClick={discardDraft} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #d8c48a', background: 'transparent', color: '#7a5b10', fontWeight: 700, cursor: 'pointer' }}>Discard</button>
          </div>
        </div>
      )}
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
            <span style={{ fontSize: 12, fontWeight: 700, color: sectionsDone === SECTIONS.length ? '#166534' : '#64748b', background: sectionsDone === SECTIONS.length ? '#e8f7ee' : '#f1f5f9', padding: '5px 12px', borderRadius: 999 }}>
              {sectionsDone}/{SECTIONS.length} sections ✓
            </span>
          </div>
          <BuyerDemandPanel compact industry={form.industry || undefined} location={form.location_general || undefined} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: saveState === 'saved' ? '#16a34a' : saveState === 'error' ? '#b91c1c' : '#9a6700', minHeight: 16 }}>
              {saveState === 'saving' ? '⏳ Saving…' : saveState === 'saved' ? (editListingId ? '✓ Changes saved' : '✓ Draft auto-saved') : saveState === 'error' ? '⚠ Save failed — check connection' : (restoreCandidate ? '💾 Unsaved draft' : '')}
            </div>
            <button type="button" onClick={() => saveNow()} disabled={saveState === 'saving' || busy} title="Save now — handy on slow connections" style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #c9a84c', background: '#fffdf7', color: '#1a1a2e', fontSize: 12, fontWeight: 800, cursor: saveState === 'saving' || busy ? 'wait' : 'pointer', opacity: saveState === 'saving' || busy ? 0.6 : 1 }}>
              {saveState === 'saving' ? 'Saving…' : '💾 Save now'}
            </button>
          </div>
        </div>
      </div>

      {/* Container query host: the form embeds in the AI Deal Studio's narrow center column, so the grid collapses on ITS container width, not the viewport (the old fixed 230+280px columns overflowed and the right rail intercepted clicks on the submit button). */}
      <div style={{ containerType: 'inline-size' }}>
      <div className="listing-studio-grid" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) 280px', gap: 20, alignItems: 'start' }}>
        <aside className="card" style={{ padding: 10, position: 'sticky', top: 84 }}>
          {SECTIONS.map((item, index) => {
            const active = item.id === section
            return (
              <button key={item.id} type="button" onClick={() => setSection(item.id)} style={{ width: '100%', textAlign: 'left', padding: '13px 12px', marginBottom: 4, borderRadius: 8, border: active ? '1px solid rgba(37,99,235,.28)' : '1px solid transparent', background: active ? '#eff6ff' : 'transparent', cursor: 'pointer', color: active ? '#0f3460' : 'var(--text)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, display: 'grid', placeItems: 'center', background: sectionComplete[item.id] ? '#16a34a' : active ? '#2563eb' : '#e8edf3', color: '#fff', fontSize: 12, fontWeight: 800 }}>
                    {sectionComplete[item.id] ? '✓' : index + 1}
                  </span>
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
          {section === 'media' && <MediaSection form={form} setValue={setValue} listingId={createdListingId} />}
          {section === 'public' && <PublicSection form={form} setValue={setValue} />}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--line)', marginTop: 28, paddingTop: 20 }}>
            <button type="button" className="btn btn-ghost" onClick={() => moveSection(section, -1, setSection)} disabled={section === SECTIONS[0].id}>Previous</button>
            {section === SECTIONS[SECTIONS.length - 1].id
              ? <button type="submit" className="btn btn-primary" disabled={busy} style={{ opacity: busy ? 0.6 : 1, background: readiness.score >= 70 ? '#166534' : undefined, borderColor: readiness.score >= 70 ? '#166534' : undefined }}>{busy ? 'Creating trusted record…' : readiness.score >= 70 ? '✓ Ready — advance to Verify' : 'Create Draft & Start Review'}</button>
              : <button type="button" className="btn btn-navy" onClick={() => {
                  const missing = missingInSection(section)
                  if (missing.length) {
                    const secLabel = SECTIONS.find((s) => s.id === section)?.label || ''
                    toast(`Optional for now — ${missing.join(', ')} missing in ${secLabel}. You can fill them later; tap Continue to move on.`, 'info')
                  }
                  moveSection(section, 1, setSection)
                }}>{readiness.score >= 70 && sectionComplete[section] ? '✓ Next' : 'Continue'}</button>}
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
      </div>

      {matched && <MatchedBuyersModal matches={matched} listingIndustry={form.industry} onDone={finishMatching} />}
      {showIntake && <ListingIntakeModal onApply={applyIntakeDraft} onClose={() => setShowIntake(false)} />}
      {dupes && <DuplicateListingModal matches={dupes} onContinue={() => { setDupes(null); doCreate() }} onClose={() => setDupes(null)} />}
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
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importFinancials(f) }} />
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
    <Field label="Commission split — agent vs brokerage" span>
      <div style={{ padding: 14, borderRadius: 10, background: '#f8fbff', border: '1px solid #dbe7f3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <input
            type="range"
            min="0" max="100" step="5"
            value={form.commission_split_agent}
            onChange={(event) => {
              const agent = Number(event.target.value)
              setValue('commission_split_agent', agent)
              setValue('commission_split_brokerage', 100 - agent)
            }}
            style={{ flex: 1, minWidth: 180, accentColor: '#2563eb' }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '6px 12px', borderRadius: 8 }}>Agent {form.commission_split_agent}%</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', background: '#f0ecdf', padding: '6px 12px', borderRadius: 8 }}>Brokerage {form.commission_split_brokerage}%</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Who closes the deal earns their split of the {10}% brokerage fee. Default 50/50 — adjust per deal.
        </div>
      </div>
    </Field>
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
    <Field label="Customer concentration"><select className="select" value={form.customer_concentration} onChange={(event) => setValue('customer_concentration', event.target.value)}>
        <option value="">Select largest customer share…</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={`${n}%`}>{n}% of revenue</option>)}
        <option value="none">None — no single customer over 12%</option>
        {form.customer_concentration && !['none', ...Array.from({ length: 12 }, (_, i) => `${i + 1}%`)].includes(form.customer_concentration) && <option value={form.customer_concentration}>{form.customer_concentration} (existing)</option>}
      </select></Field>
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

function MediaSection({ form, setValue, listingId }: SectionProps & { listingId?: string | null }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0 || uploading) return
    setUploading(true)
    try {
      const arr = Array.from(files).slice(0, 10)
      const res = await uploadListingImages(listingId || 'pending', arr)
      if (!res.success) throw new Error(res.error || 'Upload failed')
      const next = [...form.gallery_images, ...res.urls]
      setValue('gallery_images', next)
      toast(`Uploaded ${res.urls.length} image${res.urls.length === 1 ? '' : 's'} — they appear in the public gallery`, 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const remove = async (url: string) => {
    setValue('gallery_images', form.gallery_images.filter((u) => u !== url))
    // Best-effort storage cleanup (path is the last segment pair listingId/image-N.ext).
    const m = url.match(/listing_images\/(.+)$/)
    if (m) await deleteListingImage(m[1]).catch(() => {})
    toast('Image removed', 'success')
  }

  const photoCount = form.gallery_images.length
  const photoPct = Math.min(100, Math.round((photoCount / 10) * 100))

  return <Section title="Photos & Video" subtitle="Gallery images and a walkthrough video make the public listing stand out and build buyer trust.">
    <div style={{ marginBottom: 16, padding: '12px 14px', background: '#f4f8fc', border: '1px solid #dbe7f3', borderRadius: 10, fontSize: 12.5, color: '#1e3a5f' }}>
      <strong>📷 Gallery:</strong> upload up to 10 photos (JPG/PNG/WebP, 5MB each) — the first image is the listing cover. Photos appear on the public page after publishing.
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ marginLeft: 10, padding: '5px 12px', borderRadius: 7, background: '#2563eb', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer' }}>
        {uploading ? 'Uploading…' : 'Choose photos'}
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} />
    </div>

    {/* One-click branded cover — instant professional look without photos. */}
    {photoCount === 0 && (
      <div style={{ marginBottom: 14, padding: '12px 14px', background: 'linear-gradient(135deg,#faf9f6,#f4f1e8)', border: '1px dashed #c9b98a', borderRadius: 10, fontSize: 12.5, color: '#6b5b2a' }}>
        <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>✨ No photos yet?</div>
        <div style={{ marginBottom: 10 }}>Generate a cover instantly — a real industry photo (bakery, plumbing, restaurant…) when available, branded cover as fallback — so the listing looks professional the moment it publishes. Replace with real photos anytime.</div>
        <button
          type="button"
          onClick={() => {
            const cover = listingImageFor(form.gallery_images ?? [], form.industry, { title: form.business_name || form.public_title, price: form.asking_price, subIndustry: form.sub_industry }) ?? placeholderImageFor({ title: form.business_name || form.public_title, industry: form.industry, price: form.asking_price })
            setValue('gallery_images', [cover])
            toast('Cover generated — real industry photo when available, becomes the listing cover', 'success')
          }}
          style={{ padding: '8px 16px', borderRadius: 8, background: '#1a1a2e', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}
        >
          🖼️ Generate cover
        </button>
      </div>
    )}

    {/* Photo count progress — listings with 5+ photos get significantly more buyer interest. */}
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
        <span>{photoCount} / 10 photos</span>
        {photoCount >= 5 ? <span style={{ color: '#1e7e34' }}>✅ Great coverage — buyers love this</span> : photoCount > 0 ? <span style={{ color: '#b45309' }}>Add {5 - photoCount} more for best results</span> : <span>Add at least 5 for best results</span>}
      </div>
      <div style={{ height: 7, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: photoCount >= 5 ? '#1e7e34' : '#2563eb', width: `${photoPct}%`, transition: 'width .25s ease' }} />
      </div>
    </div>

    {/* Auto-generated placeholder hint (no photos needed to look professional). */}
    {photoCount === 0 && (
      <div style={{ marginBottom: 16, padding: '10px 14px', background: '#faf9f6', border: '1px dashed #c9b98a', borderRadius: 10, fontSize: 12.5, color: '#6b5b2a' }}>
        ✨ <strong>No photos?</strong> We auto-generate a branded listing image (industry icon + title + price) so your listing still looks professional. Upload real photos anytime to replace it.
      </div>
    )}

    {/* Listing contact line — the click-to-call option. */}
    <div style={{ marginBottom: 18 }}>
      <Field label="Listing call line (optional — shows a 📞 Call button on the public page)" span>
        <input
          className="input"
          value={String((form as any).contact_phone || '')}
          onChange={(event) => setValue('contact_phone', event.target.value)}
          placeholder="(555) 123-4567 — the number buyers will call for THIS listing"
        />
      </Field>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: -10 }}>We log call clicks so you can see buyer interest. Leave blank to route all inquiries through the contact form instead.</div>
    </div>

    {form.gallery_images.length > 0 ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
        {form.gallery_images.map((url, i) => (
          <div key={url} style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: i === 0 ? '2px solid var(--gold-dark)' : '1px solid var(--line)' }}>
            <img src={url} alt={`Gallery ${i + 1}`} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
            {i === 0 && <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(26,26,46,0.8)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}>COVER</div>}
            <button type="button" onClick={() => remove(url)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,38,38,0.9)', border: 'none', color: '#fff', width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </div>
    ) : (
      <div style={{ marginBottom: 18, padding: '28px 20px', border: '1px dashed var(--line)', borderRadius: 12, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        No photos yet — listings with a cover photo get significantly more buyer interest.
      </div>
    )}

    <Field label="Walkthrough / promo video URL (YouTube, Vimeo, or .mp4)" span>
      <input className="input" value={form.video_url} onChange={(event) => setValue('video_url', event.target.value)} placeholder="https://youtube.com/watch?v=… or https://…/walkthrough.mp4" />
    </Field>
  </Section>
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
