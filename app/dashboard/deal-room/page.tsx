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
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: 'var(--navy)', margin: 0 }}>📁 Deal Rooms</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '6px 0 0' }}>
              One shared Dropbox-style workspace per deal — agents, buyers &amp; sellers upload, organize due-diligence folders, and collaborate in real time.
            </p>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading deals..." />
        ) : deals.length === 0 ? (
          <div style={{ border: '1px dashed var(--line)', borderRadius: 12, padding: 40, textAlign: 'center', background: '#fff' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            <div style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 15 }}>No deals yet</div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Deal Rooms appear here as soon as a deal exists. Open a deal from the pipeline to start sharing documents.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deals.map((d) => (
              <Link
                key={d.id}
                href={`/dashboard/deal-room/${d.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                  background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px',
                  transition: 'box-shadow .15s ease, border-color .15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(26,26,46,0.08)'; e.currentTarget.style.borderColor = 'var(--gold)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--line)' }}
              >
                <span style={{ fontSize: 24 }}>📁</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                    {d.buyer ? `Buyer: ${d.buyer} · ` : ''}Status: {d.status}
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--gold-dark)' }}>Open Room →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
