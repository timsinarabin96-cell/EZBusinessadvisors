/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/api-keys — admin-only API key registry + accountant cost sync.
// Every key, the website it connects to, and its purpose — plus a one-click
// provider cost sync (Claude / DeepSeek / OpenAI / Twilio / Supabase / Vercel)
// that records spend into the expenses ledger.
// PLATFORM ADMIN ONLY — API route enforces it + RLS at the DB layer.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface KeyRow {
  id: string
  key_name: string
  provider: string
  website_url: string | null
  purpose: string | null
  status: string
  masked_tail: string | null
  notes: string | null
  updated_at: string
}

const STATUS_COLOR: Record<string, string> = {
  configured: '#15803d',
  missing: '#b45309',
  revoked: '#b91c1c',
}

const EMPTY_FORM = { key_name: '', provider: '', website_url: '', purpose: '', status: 'configured', masked_tail: '' }

export default function AdminApiKeysPage() {
  const toast = useToast()
  const [keys, setKeys] = useState<KeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/api-keys')
      const j = await res.json()
      if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
      else setKeys(j.keys || [])
    } catch {
      setError('Failed to load API keys registry.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!form.key_name.trim() || !form.provider.trim()) {
      toast('Key name and provider are required', 'error')
      return
    }
    const res = await authenticatedFetch('/api/admin/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Save failed', 'error'); return }
    toast('Saved', 'success')
    setShowForm(false)
    setForm(EMPTY_FORM)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Remove this key from the registry?')) return
    const res = await authenticatedFetch(`/api/admin/api-keys?id=${id}`, { method: 'DELETE' })
    const j = await res.json()
    if (!j.ok) { toast(j.error || 'Delete failed', 'error'); return }
    toast('Removed', 'success')
    load()
  }

  const runSync = async () => {
    setSyncing(true)
    try {
      const res = await authenticatedFetch('/api/admin/expenses/sync', { method: 'POST' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || 'Sync failed')
      toast(`Cost sync — ${j.summary.added} added, ${j.summary.skipped} skipped, ${j.summary.backfilled} re-categorized`, 'success')
      load()
    } catch (e) {
      toast((e as Error).message || 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const providers = Array.from(new Set(keys.map((k) => k.provider)))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>🔑 API Keys &amp; Accountant</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Every key, the website it connects to, and its purpose — admin-only. Full secrets live in .env.local / Vercel.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={runSync} disabled={syncing} style={{ background: '#15803d', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {syncing ? 'Syncing…' : '💰 Sync Provider Costs'}
          </button>
          <button onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM) }} style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {showForm ? 'Cancel' : '+ Add Key'}
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 18px', borderRadius: 10, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 14 }}>Add / update key</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input placeholder="Key name (e.g. OPENAI_API_KEY)" value={form.key_name} onChange={(e) => setForm({ ...form, key_name: e.target.value.toUpperCase() })} style={inputStyle} />
            <input placeholder="Provider (e.g. OpenAI)" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} style={inputStyle} />
            <input placeholder="Website URL (e.g. https://platform.openai.com)" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} style={inputStyle} />
            <input placeholder="Masked tail (…a1b2) — never the full key" value={form.masked_tail} onChange={(e) => setForm({ ...form, masked_tail: e.target.value })} style={inputStyle} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }}>
              <option value="configured">Configured</option>
              <option value="missing">Missing</option>
              <option value="revoked">Revoked</option>
            </select>
            <input placeholder="Purpose (what this key powers)" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
          </div>
          <button onClick={save} style={{ marginTop: 14, background: '#1a1a2e', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        providers.map((prov) => (
          <div key={prov} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{prov}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.filter((k) => k.provider === prov).map((k) => (
                <div key={k.id} style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 220, flex: 1 }}>
                    <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 13.5, fontFamily: 'monospace' }}>{k.key_name}</div>
                    {k.purpose && <div style={{ fontSize: 12.5, color: '#666', marginTop: 3 }}>{k.purpose}</div>}
                    {k.website_url && (
                      <a href={k.website_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1d4ed8', marginTop: 3, display: 'inline-block' }}>
                        🌐 {k.website_url.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[k.status] || '#64748b', background: '#f8fafc', padding: '4px 10px', borderRadius: 999 }}>{k.status}</span>
                    {k.masked_tail && <span style={{ fontSize: 12, color: '#aaa', fontFamily: 'monospace' }}>{k.masked_tail}</span>}
                    <button onClick={() => remove(k.id)} style={{ background: 'none', border: '1px solid #fecaca', color: '#b91c1c', padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        💰 Costs sync automatically every day at 5:00 AM ET (Vercel cron → expenses ledger, deduped). Manual sync button above.
        🔒 Full API secrets are never stored in this registry — only names, linked websites, purposes, and masked tails.
        The real values live in <strong>.env.local</strong> and <strong>Vercel environment variables</strong>.
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 8, border: '1px solid #d8d2c4', fontSize: 13, fontFamily: 'inherit',
  width: '100%', boxSizing: 'border-box', background: '#fff',
}
