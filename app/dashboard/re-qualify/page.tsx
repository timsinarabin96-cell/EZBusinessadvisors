/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { Chip, GoldButton, PageHero, SectionTitle } from '@/components/ui/premium'
import { LoadingState } from '@/components/ui'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

// =============================================================================
// Lead Re-qualification — in-app, advisory ONLY. Re-scores existing buyer &
// seller leads from data already in the platform (verification, listing
// attachment, notes, recency). NEVER emails anyone; results are suggestions.
// =============================================================================

interface QualRow {
  lead_id: string
  kind: 'buyer' | 'seller'
  name: string
  score: number
  tier: 'hot' | 'warm' | 'cold'
  reasons: string[]
  created_at?: string
}

const TIER_TONE: Record<string, 'green' | 'gold' | 'red' | 'gray'> = {
  hot: 'red',
  warm: 'gold',
  cold: 'gray',
}

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

export default function ReQualifyPage() {
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [events, setEvents] = useState<QualRow[]>([])
  const [lastRun, setLastRun] = useState<{ ranAt?: string; counts?: { buyer: number; seller: number; hot: number; warm: number; cold: number } }>({})

  const loadEvents = useCallback(async (ag: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/leads/re-qualify?agencyId=${ag}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    if (json?.events?.length) {
      setEvents((json.events as QualRow[]).slice(0, 60))
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      const ag = ctx?.agencyId || ''
      if (ag) {
        setAgencyId(ag)
        await loadEvents(ag)
      }
      setLoading(false)
    })()
  }, [loadEvents])

  const run = async () => {
    if (!agencyId) return
    setBusy(true)
    setNotice('')
    const token = getStoredAccessToken()
    const res = await fetch('/api/leads/re-qualify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ agencyId }),
    }).catch(() => null)
    const json = await res?.json().catch(() => ({}))
    setBusy(false)
    if (json?.ok) {
      setLastRun({ ranAt: json.ranAt, counts: json.counts })
      setEvents((json.results || []).slice(0, 60))
      setNotice(`Re-qualified ${json.counts?.buyer || 0} buyers + ${json.counts?.seller || 0} sellers. Advisory only — no emails sent.`)
    } else {
      setNotice(`Failed: ${json?.error || 'unknown error'}`)
    }
  }

  return (
    <AppShell active="Re-qualify">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
        <PageHero
          icon="🔁"
          eyebrow="Lead Intelligence"
          title="Re-qualify Leads"
          sub="Re-score existing buyer & seller leads from data already on file. Results are in-app suggestions — nothing is emailed."
        />

        {loading ? (
          <LoadingState label="Loading…" />
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
              <GoldButton disabled={busy} onClick={run}>
                {busy ? 'Scoring…' : 'Run re-qualification now'}
              </GoldButton>
              {notice && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{notice}</span>}
            </div>

            {lastRun.counts && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <Chip tone="blue">Buyers: {lastRun.counts.buyer}</Chip>
                <Chip tone="navy">Sellers: {lastRun.counts.seller}</Chip>
                <Chip tone="red">Hot: {lastRun.counts.hot}</Chip>
                <Chip tone="gold">Warm: {lastRun.counts.warm}</Chip>
                <Chip tone="gray">Cold: {lastRun.counts.cold}</Chip>
                {lastRun.ranAt && <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Last run {fmtDate(lastRun.ranAt)}</span>}
              </div>
            )}

            <SectionTitle eyebrow={`${events.length} shown`} title="Qualification results" />
            {events.length === 0 ? (
              <div style={{ padding: '28px 0', color: 'var(--muted)', fontSize: 13.5 }}>
                No results yet — hit “Run re-qualification now” to score your leads.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {events.map((e, i) => (
                  <div key={`${e.lead_id}-${i}`} style={{ background: '#fff', border: '1px solid rgba(15,52,96,.08)', borderRadius: 14, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--navy)' }}>{e.name || 'Unnamed'}</span>{' '}
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{e.kind}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>{e.score}/100</span>
                        <Chip tone={TIER_TONE[e.tier]}>{e.tier}</Chip>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{e.reasons?.join(' · ')}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
