/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// AgencyBilling — agency-view billing & plan page.
//   - Current trial / plan status with TrialStatusBadge
//   - Usage counters vs trial limits (listings/leads/deals/storage/agents)
//   - Plan cards (Starter $9, Professional $49, Enterprise $149) with upgrade
//     → calls convert-trial API; then prompts Stripe payment (hook placeholder)
//   - Subscription history table
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { fetchUserAgencyContext, type Agency } from '@/lib/agencies'
import TrialStatusBadge from '@/components/agency/TrialStatusBadge'
import LicenseSubscriptionPanel from '@/components/agency/LicenseSubscriptionPanel'
import { statusFromAgency, getAgencyUsage, DEFAULT_LIMITS, type TrialState, type AgencyUsage } from '@/lib/trial'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { CRM_LICENSE } from '@/lib/billing'

// ---------------------------------------------------------------------------
// Plan cards — single source of truth is lib/pricing.ts (CRM_PLANS). Never
// hardcode prices here again (audit #1: was $49/$99/$149 vs $499/$899).
// ---------------------------------------------------------------------------
import { CRM_PLANS } from '@/lib/pricing'

const PLANS = CRM_PLANS.map((p) => ({ id: p.id, name: p.name, monthly: p.monthly, features: p.features }))

interface SubRow { plan_type: string | null; start_date: string | null; end_date: string | null; amount: number | null; status: string | null; notes: string | null }

export default function AgencyBilling() {
  const toast = useToast()
  const [agency, setAgency] = useState<Agency | null>(null)
  const [state, setState] = useState<TrialState | null>(null)
  const [usage, setUsage] = useState<AgencyUsage | null>(null)
  const [history, setHistory] = useState<SubRow[]>([])
  const [paying, setPaying] = useState<string | null>(null)
  const [licensing, setLicensing] = useState(false)

  const isLicensed = agency?.plan_type === 'license'

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('license') === 'success') {
      toast('License activated — welcome aboard! 🎉', 'success')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [toast])

  useEffect(() => {
    (async () => {
      try {
        const ctx = await fetchUserAgencyContext()
        setAgency(ctx.agency)
        setState(statusFromAgency(ctx.agency))
        if (ctx.agency) {
          setUsage(await getAgencyUsage(ctx.agency.id))
          const { data } = await supabase.from('subscription_history').select('*').eq('agency_id', ctx.agency.id).order('created_at', { ascending: false }).limit(20)
          setHistory((data as SubRow[]) || [])
        }
      } catch { /* degrade */ }
    })()
  }, [])

  const rows = useMemo(() => {
    if (!usage) return []
    const max = DEFAULT_LIMITS
    return [
      { label: '🏢 Listings', used: usage.listingsUsed, max: max.maxListings },
      { label: '🎯 Leads', used: usage.leadsUsed, max: max.maxLeads },
      { label: '🤝 Deals', used: usage.dealsUsed, max: max.maxDeals },
      { label: '🤖 Agents', used: usage.agentsUsed, max: max.maxAgents },
      { label: '💾 Storage (MB)', used: Math.round(usage.storageUsedBytes / 1024 / 1024), max: Math.round(max.maxStorageBytes / 1024 / 1024) },
    ]
  }, [usage])

  async function upgrade(planId: string) {
    if (!['free', 'professional', 'enterprise'].includes(planId)) return
    if (!agency) return
    setPaying(planId)
    try {
      // Real Stripe Checkout first — redirects to Stripe when configured.
      const res = await authenticatedFetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'subscription', tier: planId, agencyId: agency.id }) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Checkout failed')
      if (json.mode === 'stripe' && json.url) {
        window.location.href = json.url
        return
      }
      // Demo fallback: convert the trial locally (no charge).
      const res2 = await authenticatedFetch('/api/billing/convert-trial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agencyId: agency.id, planType: planId }) })
      const json2 = await res2.json()
      if (!json2.ok) throw new Error(json2.error || 'Upgrade failed')
      toast(`Upgraded to ${planId} — demo mode, no charge`, 'success')
      setState(statusFromAgency({ ...agency, paid_plan_active: true, plan_type: planId } as Agency))
    } catch (e: any) {
      toast(e.message || 'Upgrade failed', 'error')
    } finally { setPaying(null) }
  }

  async function purchaseLicense() {
    if (!agency) return
    setLicensing(true)
    try {
      const res = await authenticatedFetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'license', agencyId: agency.id }) })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Checkout failed')
      if (json.mode === 'stripe' && json.url) {
        window.location.href = json.url
        return
      }
      // Demo mode: agency is marked licensed server-side; reflect locally.
      toast('License activated (demo mode — no charge). Add Stripe keys to take real payments.', 'success')
      setState(statusFromAgency({ ...agency, paid_plan_active: true, plan_type: 'license' } as Agency))
      setAgency({ ...agency, plan_type: 'license', paid_plan_active: true })
    } catch (e: any) {
      toast(e.message || 'License purchase failed', 'error')
    } finally { setLicensing(false) }
  }

  return (
    <div style={{ fontFamily: 'Georgia, serif', padding: '4px 0 40px', maxWidth: 880, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 2 }}>Billing & Plan</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{agency?.name || 'Your agency'} account</p>
        </div>
        {state && <TrialStatusBadge state={state} />}
      </div>

      {/* Trial / usage summary */}
      {state && state.isTrial && (
        <div style={{ background: 'linear-gradient(120deg, var(--navy), #263059)', color: '#fff', borderRadius: 14, padding: 18, marginBottom: 22 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Free trial — {state.daysRemaining} day{state.daysRemaining === 1 ? '' : 's'} remaining</div>
          <div style={{ opacity: 0.75, fontSize: 13, margin: '4px 0 14px' }}>Upgrade to keep your listings, leads, and deals without limits.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {rows.map((r) => {
              const pct = r.max ? Math.min(100, Math.round((r.used / r.max) * 100)) : 0
              return (
                <div key={r.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13 }}>{r.label}</div>
                  <div style={{ fontWeight: 800, fontSize: 16, margin: '4px 0' }}>{r.used}<span style={{ fontWeight: 400, fontSize: 12, opacity: 0.7 }}> / {r.max}</span></div>
                  <div style={{ height: 5, background: 'rgba(255,255,255,0.18)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#f87171' : 'var(--gold)', borderRadius: 99 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {state && (state.status === 'grace' || state.status === 'expired' || state.status === 'locked') && (
        <div style={{ background: '#fef7e0', border: '1px solid #f0e0a8', color: '#9a6a00', borderRadius: 12, padding: '14px 16px', fontSize: 14, marginBottom: 22 }}>
          {state.status === 'locked' ? '🔒 Account locked — contact support to restore access.' : '⚠️ Your trial has ended. Your data is preserved — upgrade to keep creating.'}
        </div>
      )}

      {/* Phase 3: recurring CRM subscription (self-serve seats/cancel/checkout) */}
      {agency && <LicenseSubscriptionPanel agencyId={agency.id} />}

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 26 }}>
        {PLANS.map((p) => (
          <div key={p.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
            {state?.planType === p.id && <div style={{ position: 'absolute', top: 12, right: 12, background: '#e6f4ea', color: '#1e7e34', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99 }}>Current</div>}
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 2px' }}>${p.monthly}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}>/mo</span></div>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink)', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <button
              onClick={() => upgrade(p.id)}
              disabled={paying === p.id}
              style={{
                marginTop: 6, padding: '11px', borderRadius: 10, background: state?.planType === p.id ? 'transparent' : 'var(--gold)',
                color: state?.planType === p.id ? 'var(--muted)' : 'var(--navy)',
                border: state?.planType === p.id ? '1px solid var(--line)' : 'none', fontWeight: 800, fontSize: 14, cursor: paying === p.id ? 'wait' : state?.planType === p.id ? 'default' : 'pointer',
              }}
            >
              {paying === p.id ? 'Processing…' : state?.planType === p.id ? 'Current plan' : `Upgrade to ${p.name}`}
            </button>
          </div>
        ))}
      </div>

      {/* White-label CRM license */}
      <div style={{ background: isLicensed ? 'linear-gradient(120deg, #1a2e1a, #26482e)' : '#fff', border: isLicensed ? '1px solid #2f6b3a' : '2px solid var(--gold)', borderRadius: 16, padding: 22, marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: isLicensed ? '#8fd6a0' : '#8a6d1a' }}>
              {isLicensed ? '✓ License Active' : 'Own the CRM Platform'}
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, margin: '4px 0 2px', color: isLicensed ? '#fff' : 'var(--ink)' }}>
              {CRM_LICENSE.name}
            </div>
            <div style={{ fontSize: 13.5, color: isLicensed ? 'rgba(255,255,255,0.75)' : 'var(--muted)' }}>
              {isLicensed
                ? 'Your brokerage runs on its own domain with its own branding, marketplace, and API keys.'
                : <>${CRM_LICENSE.setupFee.toLocaleString()} one-time setup + ${CRM_LICENSE.monthly}/month — white-label domain, isolated marketplace, your own AI keys.</>}
            </div>
          </div>
          {!isLicensed && (
            <button
              onClick={purchaseLicense}
              disabled={licensing}
              style={{ padding: '12px 22px', borderRadius: 10, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 14.5, cursor: licensing ? 'wait' : 'pointer' }}
            >
              {licensing ? 'Opening checkout…' : `Purchase License — $${CRM_LICENSE.setupFee.toLocaleString()}`}
            </button>
          )}
        </div>
        {isLicensed && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>
            Platform fee ${CRM_LICENSE.monthly}/month · cancel anytime · support included
          </div>
        )}
      </div>

      {/* Subscription history */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Subscription history</h2>
        {history.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No billing activity yet.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10, fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{h.plan_type}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {h.start_date ? new Date(h.start_date).toLocaleDateString() : ''} → {h.end_date ? new Date(h.end_date).toLocaleDateString() : 'ongoing'}
                  {h.notes ? ` · ${h.notes}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {h.amount ? <span style={{ fontWeight: 800 }}>${Number(h.amount).toFixed(2)}</span> : null}
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize', color: h.status === 'active' ? '#1e7e34' : 'var(--muted)' }}>{h.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
