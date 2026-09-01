/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { fetchPipelineDeals } from '@/lib/pipeline'
import { PageHero, EmptyState } from '@/components/ui/premium'

// =============================================================================
// /dashboard/deal-room — Deal Room picker. Lists every deal with its shared
// Dropbox-style workspace (agent + buyer + seller). Click a deal to open its
// room. The room itself auto-creates the due-diligence folder template.
// =============================================================================

export default function DealRoomPickerPage() {
  const [deals, setDeals] = useState<{ id: string; title: string; status: string; buyer?: string }[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const items = await fetchPipelineDeals().catch(() => [])
    setDeals(items.map((d: any) => ({
      id: d.id,
      title: d.title || d.business_name || 'Deal',
      status: d.status || 'open',
      buyer: d.buyer_name || d.buyer?.name || undefined,
    })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <AppShell active="Deal Room">
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 18px 48px' }}>
        <PageHero
          icon="📁"
          eyebrow="Clients & Docs"
          title="Deal Rooms"
          sub="One shared Dropbox-style workspace per deal — agents, buyers & sellers upload, organize due-diligence folders, and collaborate in real time."
        />

        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {[0, 1, 2].map((i) => <div key={i} className="sk" style={{ height: 64, borderRadius: 14 }} />)}
          </div>
        ) : deals.length === 0 ? (
          <div className="p-card">
            <EmptyState
              icon="📂"
              title="No deals yet"
              sub="Deal Rooms appear here as soon as a deal exists. Open a deal from the pipeline to start sharing documents."
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/dashboard/deal-room/${d.id}`}
                className="p-card p-card-hover"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                  padding: '16px 18px',
                }}
              >
                <span style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.06))',
                  border: '1px solid rgba(201,168,76,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>📁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                    {d.buyer ? `Buyer: ${d.buyer} · ` : ''}
                    <span className="chip chip-navy" style={{ marginLeft: 4 }}>{d.status}</span>
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-dark)', whiteSpace: 'nowrap' }}>Open Room →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
