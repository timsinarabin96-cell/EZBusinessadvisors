/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/audit — the platform's admin action trail (super admin only).
// Every create/ban/lock/role-change/moderation/expense action, with the actor,
// target, and details. Filterable by action + target type + search.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'

interface AuditEntry {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string
  target_id: string | null
  target_label: string | null
  details: Record<string, unknown>
  created_at: string
}

const ACTION_COLOR: Record<string, string> = {
  ban: '#b91c1c',
  unban: '#15803d',
  lock: '#b45309',
  role_change: '#1d4ed8',
  create_user: '#15803d',
  delete_agency: '#b91c1c',
  moderate_listing: '#7c3aed',
  expense_create: '#64748b',
  expense_delete: '#b91c1c',
}

const TARGET_TYPES = ['user', 'agency', 'listing', 'subscription', 'expense', 'settings']

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [actionOptions, setActionOptions] = useState<string[]>([])
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (targetType) params.set('targetType', targetType)
      if (q.trim()) params.set('q', q.trim())
      const res = await authenticatedFetch(`/api/admin/audit?${params.toString()}`)
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setEntries(j.entries || [])
      setActionOptions(j.actionOptions || [])
    } catch { setError('Failed to load audit log.') } finally { setLoading(false) }
  }, [action, targetType, q])

  useEffect(() => { load() }, [load])

  const exportCSV = () => {
    if (!entries.length) return
    const rows = entries.map((e) => ({ created_at: e.created_at, action: e.action, actor_email: e.actor_email || '', target_type: e.target_type, target_label: e.target_label || '', target_id: e.target_id || '', details: JSON.stringify(e.details || {}) }))
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'audit-log.csv'
    a.click()
  }

  // Full-trail export (server-side, retention-window aware) — SOC 2 evidence.
  const exportFull = async () => {
    if (!confirm('Export the FULL audit trail (default: last 365 days, all actions)? This may be large.')) return
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (targetType) params.set('targetType', targetType)
      if (q) params.set('q', q)
      const res = await authenticatedFetch(`/api/admin/audit/export?${params.toString()}`)
      if (!res.ok) throw new Error('export failed')
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
    } catch {
      alert('Export failed — platform admin access required.')
    }
  }

  if (loading && entries.length === 0) return <LoadingState label="Loading audit trail..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>Platform Admin Only</h1>
        <p style={{ color: '#888' }}>{error}</p>
        <Link href="/auth" style={{ display: 'inline-block', marginTop: 16, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in as admin</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Audit Log</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Every admin action, recorded: who did what, to whom, and when. {entries.length} shown.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13 }}>
          <option value="">All actions</option>
          {actionOptions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13 }}>
          <option value="">All targets</option>
          {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          placeholder="🔍 Search email / label / id…"
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d8d2c2', fontSize: 13, width: 240 }}
        />
        <button onClick={load} style={{ padding: '8px 18px', borderRadius: 8, background: '#1a1a2e', color: '#c9a84c', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Apply</button>
        <button onClick={exportCSV} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>⬇️ CSV</button>
        <button onClick={exportFull} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d8d2c2', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>⬇️ Full trail</button>
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 20px', border: '2px dashed #e2e8f0', borderRadius: 12 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>📜</div>
            <div style={{ fontWeight: 600, color: '#64748b' }}>No audit entries match</div>
          </div>
        )}
        {entries.map((e) => {
          const color = ACTION_COLOR[e.action] || '#334155'
          const detailText = Object.entries(e.details || {})
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
            .join(' · ')
          return (
            <div key={e.id} style={{ display: 'flex', gap: 14, padding: '14px 6px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 4, borderRadius: 4, background: color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 13.5, color, textTransform: 'uppercase', letterSpacing: '.02em' }}>{e.action}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{e.target_type}</span>
                  {e.target_label && <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{e.target_label}</span>}
                </div>
                {detailText && <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3, overflowWrap: 'anywhere' }}>{detailText}</div>}
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {e.actor_email || 'unknown actor'} · {new Date(e.created_at).toLocaleString()}
                  {e.target_id ? ` · ${e.target_id.slice(0, 8)}…` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
