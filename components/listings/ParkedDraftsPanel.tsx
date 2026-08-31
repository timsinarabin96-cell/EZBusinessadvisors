/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { useToast } from '@/components/ui/Toast'

// =============================================================================
// ParkedDraftsPanel — "drafts waiting on seller input" nudge (boss 08-31).
// Reuses the stale-deal detection pattern (same scanner family as /api/stale):
// lists draft listings untouched past a threshold and lets the agent fire a
// deduped nudge notification to the owning agent. No separate reminder system.
// =============================================================================

interface StaleDraftItem {
  id: string
  label: string
  ref?: string | null
  status?: string | null
  agent_id?: string | null
  updated_at: string | null
  days_since: number
}

export default function ParkedDraftsPanel() {
  const toast = useToast()
  const [drafts, setDrafts] = useState<StaleDraftItem[]>([])
  const [loading, setLoading] = useState(true)
  const [nudging, setNudging] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch('/api/stale/drafts?days=7').then((r) => r.json().catch(() => ({})))
      setDrafts(res.drafts || [])
    } catch {
      setDrafts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const nudge = async () => {
    setNudging(true)
    try {
      const res = await authenticatedFetch('/api/stale/drafts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      }).then((r) => r.json().catch(() => ({})))
      if (res.ok) {
        toast(`📨 Nudge sent — ${res.nudged ?? 0} notification${(res.nudged ?? 0) === 1 ? '' : 's'} (${res.skipped ?? 0} already notified)`, 'success')
      } else {
        toast(res.error || 'Could not send nudge', 'error')
      }
    } catch (e: any) {
      toast(e.message || 'Could not send nudge', 'error')
    } finally {
      setNudging(false)
    }
  }

  if (loading) return null
  if (drafts.length === 0) return null

  return (
    <div className="card" style={{ padding: 18, marginBottom: 20, borderLeft: '4px solid #b45309' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title">⏸ Parked drafts — waiting on seller input</div>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
            {drafts.length} draft{drafts.length === 1 ? '' : 's'} untouched for 7+ days. Nudge the seller or resume the build.
          </p>
        </div>
        <button className="btn btn-navy" onClick={nudge} disabled={nudging} style={{ fontSize: 12.5, padding: '6px 14px', whiteSpace: 'nowrap' }}>
          {nudging ? 'Sending…' : '📨 Nudge sellers'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {drafts.map((d) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 12px', background: '#fdfaf3', borderRadius: 10, border: '1px solid #f0e6cd' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13.5 }}>{d.label}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {d.ref ? `${d.ref} · ` : ''}⏳ {d.days_since} day{d.days_since === 1 ? '' : 's'} untouched{d.status ? ` · ${String(d.status).replace(/_/g, ' ')}` : ''}
              </div>
            </div>
            <Link href={`/dashboard/studio?listing=${d.id}`} className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ▶ Resume build
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
