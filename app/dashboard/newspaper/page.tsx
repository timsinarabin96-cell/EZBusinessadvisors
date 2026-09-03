/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import {
  fetchEditions, createEdition, publishEdition, deleteEdition,
  fetchArticles, fetchSubscriptions, 
  type NewEdition, type Article, type Subscription} from '@/lib/newspaper'
import { PageHero, EmptyState } from '@/components/ui/premium'

export default function NewspaperPage() {
  return (
    <AppShell active="Newspaper">
      <ToastProvider>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 60px' }}>
          <Newspaper />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function Newspaper() {
  const toast = useToast()
  const [editions, setEditions] = useState<NewEdition[]>([])
  const [subs, setSubs] = useState<Subscription[]>([])
  const [articles, setArticles] = useState<Record<string, Article[]>>({})
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const [eds, s] = await Promise.all([fetchEditions(), fetchSubscriptions()])
    setEditions(eds)
    setSubs(s)
    const map: Record<string, Article[]> = {}
    await Promise.all(eds.slice(0, 6).map(async (e) => { map[e.id] = await fetchArticles(e.id) }))
    setArticles(map)
  }, [])

  useEffect(() => { reload() }, [reload])

  const onCreate = async () => {
    setBusy(true)
    const id = await createEdition()
    setBusy(false)
    if (!id) return toast('Failed to create edition', 'error')
    toast('Edition created + auto-generated from live data')
    await reload()
  }

  const onPublish = async (id: string) => {
    setBusy(true)
    const ok = await publishEdition(id)
    setBusy(false)
    if (!ok) return toast('Publish failed', 'error')
    toast('Published — ready to email')
    await reload()
  }

  const onEmail = async (id: string) => {
    setBusy(true)
    const res = await fetch('/api/newspaper/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: id }),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error' }))
    setBusy(false)
    if (!res.ok) return toast(res.error || 'Send failed', 'error')
    toast(`Sent to ${res.sent} subscriber${res.sent === 1 ? '' : 's'}`)
  }

  const onDelete = async (id: string) => {
    await deleteEdition(id)
    await reload()
  }

  return (
    <div>
      <PageHero
        icon="📰"
        eyebrow="Newspaper"
        title="Weekly Newspaper"
        sub={`Auto-sends every Monday 8 AM ET to ${subs.filter((s) => s.status === 'active').length} subscribers. Create an edition anytime to preview.`}
        actions={
          <button
            onClick={onCreate}
            disabled={busy}
            style={{ background: busy ? '#999' : 'var(--navy)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {busy ? 'Working…' : '+ New Edition (auto-generate)'}
          </button>
        }
      />

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {editions.length === 0 && (
          <EmptyState
            icon="📰"
            title="No editions yet"
            sub="Hit '+ New Edition' — it auto-generates articles from your live listings, deals, and leads."
          />
        )}
        {editions.map((e) => {
          const arts = articles[e.id] || []
          const activeSubs = subs.filter((s) => s.status === 'active').length
          return (
            <div key={e.id} className="p-card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
                    {e.title} <span style={{ color: '#999', fontWeight: 400 }}>· {e.issue_label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#999', marginTop: 3 }}>
                    {arts.length} articles · {e.status === 'published' ? `Published ${e.published_at ? new Date(e.published_at).toLocaleDateString() : ''}` : 'Draft'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {e.status !== 'published' && (
                    <button onClick={() => onPublish(e.id)} disabled={busy} style={btn('#1a1a2e', '#fff')}>Publish</button>
                  )}
                  {e.status === 'published' && (
                    <button onClick={() => onEmail(e.id)} disabled={busy} style={btn('#16a34a', '#fff')}>
                      📮 Email {activeSubs} subscriber{activeSubs === 1 ? '' : 's'}
                    </button>
                  )}
                  <button onClick={() => onDelete(e.id)} style={btn('#fff', '#dc2626', true)}>Delete</button>
                </div>
              </div>
              {arts.length > 0 && (
                <div style={{ marginTop: 12, borderTop: '1px solid #f2efe6', paddingTop: 10 }}>
                  {arts.map((a) => (
                    <div key={a.id} style={{ fontSize: 12.5, color: '#555', padding: '3px 0' }}>
                      <b style={{ color: '#1a1a2e' }}>{a.section}:</b> {a.headline}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const btn = (bg: string, fg: string, outline = false): React.CSSProperties => ({
  background: outline ? bg : bg, color: fg, border: outline ? `1px solid #dc2626` : 'none',
  borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
})
