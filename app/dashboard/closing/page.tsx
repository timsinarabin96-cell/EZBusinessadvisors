/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import {
  Chip,
  DealCommandBar,
  EmptyState,
  GoldButton,
  PageHero,
  ProgressRing,
  SoftButton,
  StageStepper,
  VerticalTimeline,
  type DealCommandOption,
  type StageStep,
} from '@/components/ui/premium'

interface Milestone {
  id: string
  title: string
  category: string
  due_date: string | null
  completed_at: string | null
  created_at?: string | null
  notes: string | null
  sort_order: number
}

interface Escrow {
  id: string
  escrow_company: string | null
  account_ref: string | null
  amount: number | null
  status: string
  notes: string | null
}

interface Progress {
  total: number
  completed: number
  percent: number
  overdue: number
  nextDue: string | null
}

interface TrackerPayload {
  milestones: Milestone[]
  escrow: Escrow[]
  progress: Progress | null
}

const STAGES = [
  ['loi', 'LOI'],
  ['psa', 'PSA'],
  ['diligence', 'Diligence'],
  ['escrow', 'Escrow'],
  ['closing', 'Closing'],
  ['transition', 'Transition'],
  ['re_psa', 'RE PSA'],
  ['re_closing', 'RE Closing'],
] as const

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const money = (amount: number | null | undefined) => (amount != null ? `$${Math.round(amount).toLocaleString()}` : 'Price not set')

const parseListingLabel = (listing: { id: string; label: string }): DealCommandOption => {
  const [name, priceText] = listing.label.split(' — ')
  const askingPrice = priceText ? Number(priceText.replace(/[^0-9.]/g, '')) : null
  return { id: listing.id, name: name || 'Listing', askingPrice: Number.isFinite(askingPrice) ? askingPrice : null }
}

export default function ClosingPage() {
  return (
    <AppShell active="Closing Tracker">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
          <ClosingTracker />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function ClosingTracker() {
  const toast = useToast()
  const [deals, setDeals] = useState<DealCommandOption[]>([])
  const [selected, setSelected] = useState('')
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [escrow, setEscrow] = useState<Escrow[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [stageFilter, setStageFilter] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [escrowForm, setEscrowForm] = useState({ company: '', ref: '', amount: '' })

  const loadTracker = useCallback(async (listingId: string): Promise<TrackerPayload> => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/closing?listingId=${listingId}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    const payload = { milestones: data.milestones || [], escrow: data.escrow || [], progress: data.progress || null }
    setMilestones(payload.milestones)
    setEscrow(payload.escrow)
    setProgress(payload.progress)
    return payload
  }, [])

  const loadListings = useCallback(async (agencyId: string) => {
    const token = getStoredAccessToken()
    const headers = { authorization: `Bearer ${token}` }
    const [optRes, trackedRes] = await Promise.all([
      fetch(`/api/listings/options?agencyId=${agencyId}`, { headers }).then((res) => res.json().catch(() => ({}))),
      fetch(`/api/closing?agencyId=${agencyId}&tracked=1`, { headers }).then((res) => res.json().catch(() => ({}))),
    ])
    const trackedListings = (trackedRes.listings || []) as { id: string; business_name?: string; asking_price?: number | null }[]
    const progressPairs = await Promise.all(trackedListings.map(async (listing) => {
      const tracker = await fetch(`/api/closing?listingId=${listing.id}`, { headers }).then((res) => res.json().catch(() => ({})))
      return [listing.id, Number(tracker.progress?.percent || 0)] as const
    }))
    const progressById = new Map(progressPairs)
    const trackedById = new Map(trackedListings.map((listing) => [listing.id, listing]))
    const all = ((optRes.listings || []) as { id: string; label: string }[]).map(parseListingLabel)
    const merged = all.map((deal) => {
      const tracked = trackedById.get(deal.id)
      return {
        ...deal,
        name: tracked?.business_name || deal.name,
        askingPrice: tracked?.asking_price ?? deal.askingPrice,
        tracked: !!tracked,
        progress: progressById.get(deal.id) || 0,
      }
    }).sort((a, b) => Number(b.tracked) - Number(a.tracked) || a.name.localeCompare(b.name))
    setDeals(merged)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (ctx) await loadListings(ctx.agencyId)
      setLoading(false)
    })()
  }, [loadListings])

  const selectListing = async (id: string) => {
    setSelected(id)
    setStageFilter(undefined)
    setLoading(true)
    const token = getStoredAccessToken()
    await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'seed', listingId: id }),
    })
    const tracker = await loadTracker(id)
    setDeals((current) => current.map((deal) => deal.id === id ? { ...deal, tracked: true, progress: tracker.progress?.percent || 0 } : deal))
    setLoading(false)
  }

  const refresh = async () => {
    if (!selected) return
    const tracker = await loadTracker(selected)
    setDeals((current) => current.map((deal) => deal.id === selected ? { ...deal, tracked: true, progress: tracker.progress?.percent || 0 } : deal))
  }

  const addMilestone = async () => {
    if (!selected || !newTitle.trim()) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'milestone', listing_id: selected, title: newTitle.trim(), due_date: newDue || null, category: stageFilter }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to add milestone', 'error')
    setNewTitle('')
    setNewDue('')
    toast('Milestone added', 'success')
    await refresh()
  }

  const toggleMilestone = async (milestone: Milestone) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ milestoneId: milestone.id, completed: !milestone.completed_at }) })
    await refresh()
  }

  const deleteMilestone = async (id: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ milestoneId: id }) })
    await refresh()
  }

  const loadTemplate = async (stage: string) => {
    if (!selected) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'template', listingId: selected, stage }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Could not load template', 'error')
    toast(`Stage checklist added (${data.added ?? 0} items)`, 'success')
    await refresh()
  }

  const addEscrow = async () => {
    if (!selected || !escrowForm.company.trim()) return
    setBusy(true)
    const token = getStoredAccessToken()
    const res = await fetch('/api/closing', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'escrow', listing_id: selected, escrow_company: escrowForm.company.trim(), account_ref: escrowForm.ref.trim() || null, amount: escrowForm.amount ? Number(escrowForm.amount.replace(/[$,]/g, '')) : null, status: 'pending' }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to add escrow', 'error')
    setEscrowForm({ company: '', ref: '', amount: '' })
    toast('Escrow account added', 'success')
    await refresh()
  }

  const setEscrowStatus = async (account: Escrow, status: string) => {
    const token = getStoredAccessToken()
    await fetch('/api/closing', { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ escrowId: account.id, status }) })
    await refresh()
  }

  const selectedDeal = deals.find((deal) => deal.id === selected)
  const now = Date.now()
  const stageSteps = useMemo<StageStep[]>(() => STAGES.map(([key, label]) => {
    const items = milestones.filter((milestone) => milestone.category === key)
    const overdue = items.some((milestone) => !milestone.completed_at && milestone.due_date && new Date(milestone.due_date).getTime() < now)
    const done = items.length > 0 && items.every((milestone) => milestone.completed_at)
    const active = items.some((milestone) => !milestone.completed_at)
    return { key, label, count: items.length || undefined, state: overdue ? 'overdue' : done ? 'done' : active ? 'active' : 'pending' }
  }), [milestones, now])
  const filteredMilestones = stageFilter ? milestones.filter((milestone) => milestone.category === stageFilter) : milestones
  const nextAction = milestones.find((milestone) => !milestone.completed_at)?.title || 'All milestones complete'

  if (loading && !selected) return <LoadingState />

  return (
    <div>
      <PageHero icon="🏁" eyebrow="Closing Tracker" title="Closing & Escrow Tracker" sub="A command center for every milestone, deadline, and escrow movement from LOI through transition." />

      <div className="p-card p-card-pad" style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Open a transaction</div>
        <DealCommandBar options={deals} value={selected} onChange={selectListing} formatMoney={money} />
        {deals.filter((deal) => deal.tracked).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 14 }}>
          {deals.filter((deal) => deal.tracked).slice(0, 4).map((deal) => <button key={deal.id} type="button" onClick={() => selectListing(deal.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, border: deal.id === selected ? '1px solid #c9a84c' : '1px solid rgba(15,23,42,.08)', background: deal.id === selected ? '#fcfaf3' : '#fff', textAlign: 'left', cursor: 'pointer' }}><ProgressRing value={deal.progress || 0} size={52} stroke={6} label="" /><span style={{ minWidth: 0 }}><strong style={{ display: 'block', color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deal.name}</strong><small style={{ color: 'var(--muted)' }}>{money(deal.askingPrice)}</small></span></button>)}
        </div>}
      </div>

      {selected && progress && selectedDeal && <>
        <div style={{ position: 'sticky', top: 8, zIndex: 20, marginBottom: 18, borderRadius: 15, padding: '10px 14px', color: '#fff', background: 'linear-gradient(135deg,#111827,#0f3460)', boxShadow: '0 12px 28px rgba(15,23,42,.2)', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ flex: '1 1 180px' }}>{selectedDeal.name}</strong><span>{money(selectedDeal.askingPrice)}</span><Chip tone="gold">{progress.percent}% complete</Chip><span style={{ fontSize: 12, opacity: .82 }}>Next: {nextAction}</span>
        </div>

        <div className="p-card p-card-pad" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <ProgressRing value={progress.percent} />
            <div style={{ flex: 1, minWidth: 240 }}>
              <div className="eyebrow">Transaction health</div>
              <h2 style={{ margin: '5px 0 12px', fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: 23 }}>Closing progress</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Chip tone="green">{progress.completed}/{progress.total} milestones</Chip>
                {progress.overdue > 0 ? <Chip tone="red">{progress.overdue} overdue</Chip> : <Chip tone="gray">No overdue items</Chip>}
                <Chip tone="blue">Next due {fmtDate(progress.nextDue)}</Chip>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid rgba(15,23,42,.08)' }}>
            <StageStepper stages={stageSteps} active={stageFilter} onChange={(key) => setStageFilter(stageFilter === key ? undefined : key)} />
            {stageFilter && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><Chip tone="navy">Filtered: {STAGES.find(([key]) => key === stageFilter)?.[1]}</Chip><SoftButton onClick={() => setStageFilter(undefined)}>Show all milestones</SoftButton></div>}
          </div>
        </div>

        <div className="p-card p-card-pad" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div><div className="eyebrow">Execution timeline</div><h2 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: 21 }}>Milestones</h2></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STAGES.map(([key, label]) => <button key={key} type="button" onClick={() => loadTemplate(key)} disabled={busy} className="chip chip-gray" style={{ cursor: 'pointer', border: 0 }}>+ {label}</button>)}</div>
          </div>
          {filteredMilestones.length ? <VerticalTimeline items={filteredMilestones.map((milestone) => {
            const overdue = !milestone.completed_at && !!milestone.due_date && new Date(milestone.due_date).getTime() < now
            const age = milestone.created_at ? (now - new Date(milestone.created_at).getTime()) / 86400000 : 0
            return { id: milestone.id, title: milestone.title, category: milestone.category, dueLabel: milestone.due_date ? fmtDate(milestone.due_date) : undefined, completed: !!milestone.completed_at, overdue, attention: !overdue && !milestone.completed_at && age >= 7 && age <= 14, notes: milestone.notes }
          })} onToggle={(id) => { const milestone = milestones.find((item) => item.id === id); if (milestone) toggleMilestone(milestone) }} onDelete={deleteMilestone} /> : <EmptyState icon="✓" title="No milestones in this stage" sub="Load the stage template or add a custom milestone below." />}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(150px,auto) auto', gap: 8, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(15,23,42,.08)' }}>
            <input className="border rounded-xl px-3 py-2 text-sm" placeholder="New milestone (e.g. Lease assignment signed)" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
            <input className="border rounded-xl px-3 py-2 text-sm" type="date" value={newDue} onChange={(event) => setNewDue(event.target.value)} />
            <GoldButton onClick={addMilestone} disabled={busy || !newTitle.trim()}>+ Add milestone</GoldButton>
          </div>
        </div>

        <div className="p-card p-card-pad">
          <div><div className="eyebrow">Funds control</div><h2 style={{ margin: '4px 0 16px', fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: 21 }}>Escrow accounts</h2></div>
          {escrow.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
            {escrow.map((account) => {
              const initials = (account.escrow_company || 'Escrow').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
              const steps = account.status === 'refunded' ? ['pending', 'funded', 'refunded'] : ['pending', 'funded', 'released']
              return <div key={account.id} style={{ border: '1px solid rgba(15,23,42,.08)', borderRadius: 17, padding: 16, background: 'linear-gradient(145deg,#fff,#f8fafc)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span style={{ width: 42, height: 42, borderRadius: 13, display: 'grid', placeItems: 'center', background: '#0f3460', color: '#fff', fontWeight: 900 }}>{initials}</span><div><strong style={{ color: 'var(--navy)' }}>{account.escrow_company || 'Escrow'}</strong><small style={{ display: 'block', color: 'var(--muted)' }}>{account.account_ref || 'Account reference pending'}</small></div></div>
                <div style={{ margin: '18px 0', fontFamily: 'var(--font-display)', color: 'var(--navy)', fontSize: 30, fontWeight: 800 }}>{money(account.amount)}</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>{steps.map((step, index) => { const current = steps.indexOf(account.status); const done = index <= current; return <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}><button type="button" onClick={() => index === current + 1 && setEscrowStatus(account, step)} disabled={index > current + 1 || index <= current} aria-label={step === 'funded' ? 'Mark funded' : `Mark ${step}`} style={{ width: 25, height: 25, borderRadius: 999, border: 0, background: done ? '#0f3460' : '#e2e8f0', color: '#fff', fontSize: 11, fontWeight: 900, cursor: index === current + 1 ? 'pointer' : 'default' }}>{done ? '✓' : index + 1}</button>{index < steps.length - 1 && <span style={{ height: 2, flex: 1, background: index < current ? '#0f3460' : '#e2e8f0' }} />}</div> })}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: 'var(--muted)', fontSize: 10, textTransform: 'capitalize' }}>{steps.map((step) => <span key={step}>{step}</span>)}</div>
                {account.status === 'funded' && <div style={{ display: 'flex', gap: 8, marginTop: 14 }}><GoldButton onClick={() => setEscrowStatus(account, 'released')}>Release</GoldButton><SoftButton onClick={() => setEscrowStatus(account, 'refunded')}>Refund</SoftButton></div>}
              </div>
            })}
          </div> : <EmptyState icon="🏦" title="No escrow accounts" sub="Add the title or escrow company handling funds for this transaction." />}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px,1fr) minmax(120px,.45fr) minmax(140px,.5fr) auto', gap: 8, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(15,23,42,.08)' }}>
            <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Escrow company" value={escrowForm.company} onChange={(event) => setEscrowForm({ ...escrowForm, company: event.target.value })} />
            <input className="border rounded-xl px-3 py-2 text-sm" placeholder="Account ref" value={escrowForm.ref} onChange={(event) => setEscrowForm({ ...escrowForm, ref: event.target.value })} />
            <input className="border rounded-xl px-3 py-2 text-sm" placeholder="$ amount" inputMode="decimal" value={escrowForm.amount} onChange={(event) => setEscrowForm({ ...escrowForm, amount: formatWithCommas(event.target.value) })} />
            <GoldButton onClick={addEscrow} disabled={busy || !escrowForm.company.trim()}>+ Add escrow</GoldButton>
          </div>
        </div>
      </>}

      {!selected && <div className="p-card"><EmptyState icon="🗂️" title="No tracker open" sub="Search for a listing or choose an active tracker above." /></div>}
    </div>
  )
}
