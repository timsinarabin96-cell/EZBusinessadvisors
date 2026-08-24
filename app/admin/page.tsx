'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState } from '@/components/ui'

// =============================================================================
// /admin — Platform owner dashboard (super admin only).
// Full view across ALL tenants: every agency, user, listing, subscription,
// MRR, and per-CRM tenant settings (domain + API keys).
// =============================================================================

interface Overview {
  agencies: { total: number; active: number; paid: number; onTrial: number; locked: number }
  users: { total: number; brokers: number; agents: number; admins: number; superAdmins: number }
  listings: { total: number; published: number; draft: number; pendingReview: number }
  subscriptions: { total: number; mrrCents: number; activeSubs: number; trialing: number }
  successFees: { deals: number; totalFeeCents: number; paidFeeCents: number }
  featured: { slots: number; revenueCents: number }
  buyerPasses: { total: number; active: number; revenueCents: number }
  recentAgencies: any[]
  recentUsers: any[]
}

export default function PlatformAdminPage() {
  const [data, setData] = useState<{ overview: Overview; settings: any[] } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/overview')
        const j = await res.json()
        if (!res.ok || !j.ok) {
          setError(j.error || 'Access denied — platform admin only.')
        } else {
          setData(j)
        }
      } catch {
        setError('Failed to load platform overview.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <LoadingState label="Loading platform overview..." />
  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
        <div style={{ fontSize: 44 }}>🔐</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#1a1a2e', margin: '12px 0 8px' }}>Platform Admin Only</h1>
        <p style={{ color: '#888', fontSize: 14.5, lineHeight: 1.6 }}>{error}</p>
        <Link href="/auth" style={{ display: 'inline-block', marginTop: 18, background: '#1a1a2e', color: '#fff', padding: '11px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in as admin</Link>
      </div>
    )
  }
  if (!data) return null
  const { overview, settings } = data

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Platform Control</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, color: '#1a1a2e', margin: '6px 0 0' }}>Admin Overview</h1>
        <p style={{ color: '#888', fontSize: 14, margin: '6px 0 0' }}>Every tenant, user, listing, and dollar across the platform.</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
        <Stat label="Agencies (tenants)" value={String(overview.agencies.total)} sub={`${overview.agencies.active} active · ${overview.agencies.paid} paid · ${overview.agencies.onTrial} trial · ${overview.agencies.locked} locked`} />
        <Stat label="Users" value={String(overview.users.total)} sub={`${overview.users.admins} admins · ${overview.users.brokers} brokers · ${overview.users.agents} agents`} />
        <Stat label="Listings" value={String(overview.listings.total)} sub={`${overview.listings.published} live · ${overview.listings.draft} draft · ${overview.listings.pendingReview} pending review`} />
        <Stat label="MRR" value={'$' + (overview.subscriptions.mrrCents / 100).toLocaleString()} sub={`${overview.subscriptions.activeSubs} active subs · ${overview.subscriptions.trialing} trialing`} />
        <Stat label="Success Fees" value={'$' + (overview.successFees.totalFeeCents / 100).toLocaleString()} sub={`${overview.successFees.deals} closed deals · $${(overview.successFees.paidFeeCents / 100).toLocaleString()} paid`} />
        <Stat label="Featured Slots" value={'$' + (overview.featured.revenueCents / 100).toLocaleString()} sub={`${overview.featured.slots} slots sold`} />
        <Stat label="Match Pass" value={'$' + (overview.buyerPasses.revenueCents / 100).toLocaleString()} sub={`${overview.buyerPasses.active} active buyers`} />
      </div>

      {/* Recent agencies */}
      <Section title="Recent Tenants (CRMs sold / trials)">
        {overview.recentAgencies.length === 0 ? (
          <Empty text="No agencies yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                <th style={{ padding: '10px 12px' }}>Name</th>
                <th style={{ padding: '10px 12px' }}>Slug</th>
                <th style={{ padding: '10px 12px' }}>Plan</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {overview.recentAgencies.map((a: any) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{a.name}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{a.slug || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{a.plan_type || 'free'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge color={a.paid_plan_active ? '#22c55e' : a.trial_active ? '#f59e0b' : '#94a3b8'}>
                      {a.paid_plan_active ? 'PAID' : a.trial_active ? 'TRIAL' : 'FREE'}
                    </Badge>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Recent users */}
      <Section title="Recent Users">
        {overview.recentUsers.length === 0 ? (
          <Empty text="No users yet." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                <th style={{ padding: '10px 12px' }}>Name</th>
                <th style={{ padding: '10px 12px' }}>Email</th>
                <th style={{ padding: '10px 12px' }}>Role</th>
                <th style={{ padding: '10px 12px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {overview.recentUsers.map((u: any) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #ece8dc' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{u.full_name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#555' }}>{u.email}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <Badge color={u.role === 'super_admin' ? '#7c3aed' : u.role === 'admin' ? '#1a1a2e' : u.role === 'broker' ? '#2563eb' : '#64748b'}>{u.role || 'agent'}</Badge>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Per-tenant settings (domain + API keys) */}
      <Section title="CRM Tenants — Domains & API Keys">
        {settings.length === 0 ? (
          <Empty text="No tenant settings rows yet. They're created when a CRM is sold / agency is set up." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#1a1a2e', borderBottom: '2px solid #1a1a2e' }}>
                <th style={{ padding: '10px 12px' }}>Agency</th>
                <th style={{ padding: '10px 12px' }}>Domain</th>
                <th style={{ padding: '10px 12px' }}>AI Provider</th>
                <th style={{ padding: '10px 12px' }}>DeepSeek Key</th>
                <th style={{ padding: '10px 12px' }}>Supabase URL</th>
                <th style={{ padding: '10px 12px' }}>Stripe</th>
              </tr>
            </thead>
            <tbody>
              {settings.map((s: any) => (
                <tr key={s.agency_id} style={{ borderBottom: '1px solid #ece8dc' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{s.agency_id?.slice(0, 8)}</td>
                  <td style={{ padding: '10px 12px' }}>{s.custom_domain || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{s.ai_provider} · {s.ai_model || ''}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{s.deepseek_api_key ? '••••' + s.deepseek_api_key.slice(-4) : '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{s.supabase_project_url || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#888' }}>{s.stripe_secret_key ? 'configured' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/agencies/trials" style={{ background: '#1a1a2e', color: '#fff', padding: '11px 22px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Manage Trials</Link>
        <Link href="/admin/trial-settings" style={{ border: '2px solid #1a1a2e', color: '#1a1a2e', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Trial Settings</Link>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 700, color: '#1a1a2e', margin: '6px 0 4px' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#999', lineHeight: 1.5 }}>{sub}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: 24, marginBottom: 24 }}>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, color: '#1a1a2e', margin: '0 0 16px' }}>{title}</h2>
      {children}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ color: '#999', fontSize: 13.5, padding: '12px 0' }}>{text}</div>
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ background: color + '1a', color, padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, letterSpacing: 0.04 }}>
      {children}
    </span>
  )
}
