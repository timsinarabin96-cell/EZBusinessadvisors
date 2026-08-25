'use client'

// =============================================================================
// /admin/ai — AI Control Center (platform owner).
// Toggle every AI agent (global + per tenant), see each CRM's provider/model/
// key status, configure Twilio phone, view recent calls, set defaults.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

interface AgentDef { key: string; label: string; enabled: boolean; model: string | null }
interface Tenant { agency_id: string; name: string; plan: string; paid: boolean; ai_provider: string; ai_model: string; has_own_key: boolean; custom_domain: string | null; agents: AgentDef[] }
interface CallRow { id: string; direction: string; status: string; summary: string | null; started_at: string | null }

export default function AdminAiPage() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [calls, setCalls] = useState<CallRow[]>([])
  const [phone, setPhone] = useState<any>(null)
  const [platform, setPlatform] = useState<any>(null)
  const [twilio, setTwilio] = useState({ sid: '', auth_token: '', from: '' })
  const [savingTwilio, setSavingTwilio] = useState(false)
  const [defaults, setDefaults] = useState({ provider: 'deepseek', model: 'deepseek-v4-flash' })

  const load = useCallback(async () => {
    try {
      const res = await authenticatedFetch('/api/admin/ai')
      const j = await res.json()
      if (!res.ok || !j.ok) { setError(j.error || 'Access denied'); return }
      setAgents(j.agents || [])
      setTenants(j.tenants || [])
      setCalls(j.calls || [])
      setPhone(j.phone || null)
      setPlatform(j.platform || null)
      if (j.platform) setDefaults({ provider: j.platform.default_provider || 'deepseek', model: j.platform.default_model || 'deepseek-v4-flash' })
    } catch { setError('Failed to load AI control data.') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleAgent = async (agentKey: string, enabled: boolean, agencyId?: string) => {
    const res = await authenticatedFetch('/api/admin/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentKey, enabled, agencyId: agencyId || null }),
    })
    const j = await res.json()
    if (j.ok) { toast(`${enabled ? 'Enabled' : 'Disabled'} ${agentKey}`, 'success'); load() }
    else toast(j.error || 'Failed', 'error')
  }

  const saveTwilio = async () => {
    setSavingTwilio(true)
    try {
      const res = await authenticatedFetch('/api/admin/ai', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twilio: twilio }),
      })
      const j = await res.json()
      if (j.ok) { toast('Twilio config saved ✅', 'success'); setTwilio({ sid: '', auth_token: '', from: '' }); load() }
      else toast(j.error || 'Failed', 'error')
    } catch (e: any) { toast(e.message, 'error') } finally { setSavingTwilio(false) }
  }

  const saveDefaults = async () => {
    const res = await authenticatedFetch('/api/admin/ai', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaults }),
    })
    const j = await res.json()
    if (j.ok) toast('Platform AI defaults saved ✅', 'success')
    else toast(j.error || 'Failed', 'error')
  }

  if (loading) return <LoadingState label="Loading AI Control Center..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🛡️</div>
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
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>🧠 AI Control Center</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Every AI agent, every tenant's provider & keys, the phone system, and recent calls.</p>
      </div>

      {/* Platform defaults */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 12px' }}>Platform AI Defaults</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Provider</label>
            <select value={defaults.provider} onChange={(e) => setDefaults({ ...defaults, provider: e.target.value })} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d8d2c2' }}>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Model</label>
            <input value={defaults.model} onChange={(e) => setDefaults({ ...defaults, model: e.target.value })} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #d8d2c2' }} />
          </div>
          <button onClick={saveDefaults} style={{ background: '#1a1a2e', color: '#c9a84c', padding: '10px 20px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer' }}>Save Defaults</button>
        </div>
      </div>

      {/* Agent toggles (global) */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 14px' }}>AI Agents (platform-wide)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {agents.map((a) => (
            <div key={a.key} style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#1a1a2e', fontSize: 14 }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{a.model || 'default model'}</div>
              </div>
              <Toggle checked={a.enabled} onChange={(v) => toggleAgent(a.key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Twilio phone config */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 4px' }}>📞 Phone System (Twilio)</h2>
        <p style={{ fontSize: 13, color: '#888', margin: '0 0 14px' }}>
          Status: <strong style={{ color: phone?.configured ? '#15803d' : '#b45309' }}>{phone?.configured ? 'Configured' : 'Not configured'}</strong>
          {phone?.twilio_phone && <span style={{ marginLeft: 8 }}>· {phone.twilio_phone}</span>}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 14 }}>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Account SID</label><input className="input" value={twilio.sid} onChange={(e) => setTwilio({ ...twilio, sid: e.target.value })} placeholder={phone?.twilio_sid ? `${phone.twilio_sid} (saved)` : 'AC…'} /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Auth Token</label><input className="input" type="password" value={twilio.auth_token} onChange={(e) => setTwilio({ ...twilio, auth_token: e.target.value })} placeholder="••••••••" /></div>
          <div><label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>From number</label><input className="input" value={twilio.from} onChange={(e) => setTwilio({ ...twilio, from: e.target.value })} placeholder="+1 (555) 000-0000" /></div>
        </div>
        <button onClick={saveTwilio} disabled={savingTwilio} style={{ background: '#1a1a2e', color: '#c9a84c', padding: '11px 24px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: savingTwilio ? 'not-allowed' : 'pointer' }}>
          {savingTwilio ? 'Saving…' : 'Save Twilio Config'}
        </button>
      </div>

      {/* Tenants */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20, marginBottom: 20, overflowX: 'auto' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 14px' }}>Tenants — AI Provider & Agent Toggles</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #1a1a2e', color: '#1a1a2e' }}>
              <th style={{ padding: '8px 10px' }}>Tenant</th>
              <th style={{ padding: '8px 10px' }}>Provider</th>
              <th style={{ padding: '8px 10px' }}>Own Key</th>
              <th style={{ padding: '8px 10px' }}>Domain</th>
              <th style={{ padding: '8px 10px' }}>Agents</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.agency_id} style={{ borderBottom: '1px solid #ece8dc', verticalAlign: 'top' }}>
                <td style={{ padding: '10px' }}>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: '#999' }}>{t.plan}{t.paid ? ' · paid' : ''}</div>
                </td>
                <td style={{ padding: '10px' }}>{t.ai_provider} · {t.ai_model}</td>
                <td style={{ padding: '10px' }}>{t.has_own_key ? <span style={{ color: '#15803d', fontWeight: 800 }}>✓ yes</span> : <span style={{ color: '#94a3b8' }}>platform</span>}</td>
                <td style={{ padding: '10px', color: '#888' }}>{t.custom_domain || '—'}</td>
                <td style={{ padding: '10px', maxWidth: 340 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {t.agents.map((ag) => (
                      <button key={ag.key} onClick={() => toggleAgent(ag.key, !ag.enabled, t.agency_id)} style={{ background: ag.enabled ? '#22c55e1a' : '#94a3b81a', color: ag.enabled ? '#15803d' : '#64748b', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer' }} title={`${ag.label}: ${ag.enabled ? 'on' : 'off'}`}>
                        {ag.enabled ? '●' : '○'} {ag.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent calls */}
      <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 20 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', margin: '0 0 14px' }}>Recent Phone Calls</h2>
        {calls.length === 0 ? (
          <div style={{ color: '#999', fontSize: 13 }}>No calls yet — configure Twilio and set your phone number to start receiving calls.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #1a1a2e' }}>
                <th style={{ padding: '8px 10px' }}>When</th>
                <th style={{ padding: '8px 10px' }}>Direction</th>
                <th style={{ padding: '8px 10px' }}>Status</th>
                <th style={{ padding: '8px 10px' }}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                  <td style={{ padding: '10px', color: '#888', whiteSpace: 'nowrap' }}>{c.started_at ? new Date(c.started_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: '10px' }}>{c.direction}</td>
                  <td style={{ padding: '10px' }}>{c.status}</td>
                  <td style={{ padding: '10px', color: '#555' }}>{c.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? '#22c55e' : '#d1d5db', transition: 'background 0.15s', flexShrink: 0,
      }}
      aria-pressed={checked}
    >
      <span style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  )
}
