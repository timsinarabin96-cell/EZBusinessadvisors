'use client'

// =============================================================================
// TenantSettings — per-CRM platform configuration.
// Each sold CRM runs on its OWN domain with its OWN API keys (DeepSeek,
// Supabase, Stripe). Only agency owners/admins can edit. The buyer covers
// all API usage costs — this is where they plug in their own keys.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { LoadingState } from '@/components/ui'

export default function TenantSettings() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [form, setForm] = useState({
    custom_domain: '',
    platform_name: '',
    support_email: '',
    ai_provider: 'deepseek',
    ai_model: 'deepseek-v4-flash',
    deepseek_api_key: '',
    supabase_project_url: '',
    supabase_anon_key: '',
    stripe_secret_key: '',
  })

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: member } = await supabase
        .from('agency_members')
        .select('agency_id, role, is_owner')
        .eq('profile_id', user.id)
        .order('is_owner', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!member?.agency_id) return
      setAgencyId(member.agency_id)
      setCanEdit(Boolean(member.is_owner) || member.role === 'admin')
      const res = await fetch(`/api/agency/settings?agencyId=${member.agency_id}`)
      const j = await res.json()
      if (j.ok && j.settings) {
        const s = j.settings
        setForm({
          custom_domain: s.custom_domain || '',
          platform_name: s.platform_name || '',
          support_email: s.support_email || '',
          ai_provider: s.ai_provider || 'deepseek',
          ai_model: s.ai_model || 'deepseek-v4-flash',
          deepseek_api_key: s.deepseek_api_key || '',
          supabase_project_url: s.supabase_project_url || '',
          supabase_anon_key: s.supabase_anon_key || '',
          stripe_secret_key: s.stripe_secret_key || '',
        })
      }
    } catch { /* degrade */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!agencyId) return
    setSaving(true)
    try {
      const res = await fetch('/api/agency/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, ...form }),
      })
      const j = await res.json()
      if (j.ok) {
        toast('Tenant settings saved. Your CRM now uses its own domain & API keys.', 'success')
        load()
      } else {
        toast(j.error || 'Failed to save', 'error')
      }
    } catch (e: any) {
      toast(e.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState label="Loading tenant settings..." />

  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, color: '#1a1a2e', margin: 0 }}>🌐 CRM Tenant (Own Domain & API Keys)</h2>
          <p style={{ fontSize: 13, color: '#888', margin: '6px 0 0', maxWidth: 520 }}>
            Each sold CRM runs on its own domain with its own API keys. The buyer pays all API/infra costs —
            this is where they plug in their own DeepSeek, Supabase, and Stripe credentials.
          </p>
        </div>
        {!canEdit && <span style={{ fontSize: 12, background: '#f0ecdf', color: '#8a6d1a', padding: '5px 12px', borderRadius: 99, fontWeight: 700 }}>Owner / Admin only</span>}
      </div>

      {!agencyId ? (
        <p style={{ color: '#999', fontSize: 13.5, padding: '16px 0' }}>No agency found for your account. Tenant settings appear once you're linked to an agency (CRM).</p>
      ) : (
        <>
          {/* Own domain */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10 }}>Your Domain & Identity</div>
            <Field label="Custom domain (e.g. acme.crm.com)">
              <input className="input" value={form.custom_domain} onChange={(e) => setForm({ ...form, custom_domain: e.target.value })} placeholder="yourcrm.com" disabled={!canEdit} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Platform name (white-label)">
                <input className="input" value={form.platform_name} onChange={(e) => setForm({ ...form, platform_name: e.target.value })} placeholder="Acme Advisors" disabled={!canEdit} />
              </Field>
              <Field label="Support email">
                <input className="input" type="email" value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} placeholder="support@acme.com" disabled={!canEdit} />
              </Field>
            </div>
          </div>

          {/* Own API keys */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a2e', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 10 }}>Your API Keys (buyer pays usage)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="AI provider">
                <select className="input" value={form.ai_provider} onChange={(e) => setForm({ ...form, ai_provider: e.target.value })} disabled={!canEdit}>
                  <option value="deepseek">DeepSeek</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </Field>
              <Field label="AI model">
                <input className="input" value={form.ai_model} onChange={(e) => setForm({ ...form, ai_model: e.target.value })} placeholder="deepseek-v4-flash" disabled={!canEdit} />
              </Field>
            </div>
            <Field label="DeepSeek API key">
              <input className="input" type="password" value={form.deepseek_api_key} onChange={(e) => setForm({ ...form, deepseek_api_key: e.target.value })} placeholder={form.deepseek_api_key ? '•••••••• (saved)' : 'sk-…'} disabled={!canEdit} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Supabase project URL">
                <input className="input" value={form.supabase_project_url} onChange={(e) => setForm({ ...form, supabase_project_url: e.target.value })} placeholder="https://xxx.supabase.co" disabled={!canEdit} />
              </Field>
              <Field label="Supabase anon key">
                <input className="input" type="password" value={form.supabase_anon_key} onChange={(e) => setForm({ ...form, supabase_anon_key: e.target.value })} placeholder={form.supabase_anon_key ? '•••••••• (saved)' : 'eyJ…'} disabled={!canEdit} />
              </Field>
            </div>
            <Field label="Stripe secret key">
              <input className="input" type="password" value={form.stripe_secret_key} onChange={(e) => setForm({ ...form, stripe_secret_key: e.target.value })} placeholder={form.stripe_secret_key ? '•••••••• (saved)' : 'sk_live_…'} disabled={!canEdit} />
            </Field>
          </div>

          {canEdit && (
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ background: '#1a1a2e', color: '#c9a84c', border: 'none', padding: '12px 26px', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save Tenant Settings'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
