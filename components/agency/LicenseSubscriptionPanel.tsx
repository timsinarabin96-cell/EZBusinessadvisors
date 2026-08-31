/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// ---------------------------------------------------------------------------
// LicenseSubscriptionPanel — Phase 3 self-serve CRM subscription management.
//   - No subscription: plan (Professional/Enterprise) × cycle (monthly/annual)
//     × seat stepper (3 included, +$25/seat/mo, annual $250) → Stripe Checkout
//   - Active: status card (plan, cycle, seats, period end, cancel state),
//     seat stepper with prorated changes, cancel-at-period-end / resume.
// All mutations go through /api/billing/license-subscription (server-verified).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LICENSE_SEATS_INCLUDED, SEAT_ADDON_MONTHLY, SEAT_ADDON_ANNUAL } from '@/lib/pricing'
import { seatAddonQty, licenseTotalCents, licenseAccessGranted } from '@/lib/licenseSubscriptionsCore'

interface LicenseSummary {
  planType: 'professional' | 'enterprise'
  billingCycle: 'monthly' | 'annual'
  seats: number
  addonQty: number
  totalCents: number
  seatAddonCents: number
  includedSeats: number
}

interface LicenseRow {
  id: string
  agency_id: string
  plan_type: string
  billing_cycle: string
  status: string
  seats: number
  stripe_subscription: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  cancel_at: string | null
}

interface PanelProps {
  agencyId: string
}

const fmt = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function LicenseSubscriptionPanel({ agencyId }: PanelProps) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [license, setLicense] = useState<LicenseRow | null>(null)
  const [summary, setSummary] = useState<LicenseSummary | null>(null)
  const [planType, setPlanType] = useState<'professional' | 'enterprise'>('professional')
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [seats, setSeats] = useState(LICENSE_SEATS_INCLUDED)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authenticatedFetch(`/api/billing/license-subscription?agencyId=${encodeURIComponent(agencyId)}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Failed to load subscription')
      if (json.license) {
        setLicense(json.license)
        setSummary(json.summary)
        setPlanType(json.license.plan_type)
        setCycle(json.license.billing_cycle)
        setSeats(json.license.seats)
      }
    } catch (e: any) {
      toast(e.message || 'Failed to load subscription', 'error')
    } finally { setLoading(false) }
  }, [agencyId, toast])

  useEffect(() => { load() }, [load])

  const addonQty = useMemo(() => seatAddonQty(seats), [seats])
  const previewCents = useMemo(() => licenseTotalCents(planType, cycle, seats), [planType, cycle, seats])
  const seatPrice = cycle === 'annual' ? SEAT_ADDON_ANNUAL : SEAT_ADDON_MONTHLY

  const subscribe = async () => {
    setBusy('subscribe')
    try {
      const res = await authenticatedFetch('/api/billing/license-subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, planType, billingCycle: cycle, seats }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Checkout failed')
      if (json.url) window.location.href = json.url
      else toast('Subscription created', 'success')
    } catch (e: any) {
      toast(e.message || 'Checkout failed', 'error')
    } finally { setBusy(null) }
  }

  const changeSeats = async () => {
    setBusy('seats')
    try {
      const res = await authenticatedFetch('/api/billing/license-subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, action: 'seats', seats }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Seat update failed')
      toast(`Seats updated to ${seats} — ${json.unchanged ? 'no change' : 'proration applied'}`, 'success')
      await load()
    } catch (e: any) {
      toast(e.message || 'Seat update failed', 'error')
    } finally { setBusy(null) }
  }

  const toggleCancel = async (cancel: boolean) => {
    setBusy('cancel')
    try {
      const res = await authenticatedFetch('/api/billing/license-subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, action: cancel ? 'cancel' : 'resume' }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Update failed')
      toast(cancel ? 'Subscription will cancel at period end.' : 'Cancellation canceled — billing continues.', 'success')
      await load()
    } catch (e: any) {
      toast(e.message || 'Update failed', 'error')
    } finally { setBusy(null) }
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 22, marginBottom: 26, color: 'var(--muted)', fontSize: 13.5 }}>
        Loading subscription…
      </div>
    )
  }

  const active = license && licenseAccessGranted(license.status)

  return (
    <div style={{ background: active ? 'linear-gradient(120deg, #16283f, #1f3552)' : '#fff', border: active ? '1px solid #2b4a72' : '2px solid var(--gold)', borderRadius: 16, padding: 22, marginBottom: 26, color: active ? '#fff' : 'var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: active ? '#9cc3f5' : '#8a6d1a' }}>
            {active ? '✓ CRM Subscription Active' : 'CRM Subscription'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 3 }}>
            Recurring platform subscription — {LICENSE_SEATS_INCLUDED} seats included, ${SEAT_ADDON_MONTHLY}/seat/mo after
          </div>
        </div>
        {license && (
          <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 99, background: active ? 'rgba(255,255,255,0.12)' : '#fef3e0', color: active ? '#cfe4ff' : '#9a6a00' }}>
            {license.status}
          </span>
        )}
      </div>

      {license && active && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            ['Plan', license.plan_type === 'enterprise' ? 'Enterprise' : 'Professional'],
            ['Billing', license.billing_cycle === 'annual' ? 'Annual' : 'Monthly'],
            ['Seats', `${license.seats} (${seatAddonQty(license.seats)} add-on)`],
            ['Renews', license.current_period_end ? new Date(license.current_period_end).toLocaleDateString() : '—'],
            ['Status', license.cancel_at_period_end ? 'Cancels at period end' : license.status],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Plan + cycle + seats selector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>Plan</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['professional', 'enterprise'] as const).map((p) => (
              <button key={p} onClick={() => setPlanType(p)} disabled={!!license}
                style={{ flex: 1, padding: '9px 10px', borderRadius: 9, border: planType === p ? '2px solid var(--gold)' : '1px solid var(--line)', background: planType === p ? 'rgba(212,175,55,0.12)' : 'transparent', color: 'inherit', fontWeight: 700, fontSize: 13, cursor: license ? 'default' : 'pointer' }}>
                {p === 'enterprise' ? 'Enterprise' : 'Professional'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>Billing cycle</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['monthly', 'annual'] as const).map((c) => (
              <button key={c} onClick={() => setCycle(c)} disabled={!!license}
                style={{ flex: 1, padding: '9px 10px', borderRadius: 9, border: cycle === c ? '2px solid var(--gold)' : '1px solid var(--line)', background: cycle === c ? 'rgba(212,175,55,0.12)' : 'transparent', color: 'inherit', fontWeight: 700, fontSize: 13, cursor: license ? 'default' : 'pointer' }}>
                {c === 'annual' ? 'Annual' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, opacity: 0.8 }}>Seats ({LICENSE_SEATS_INCLUDED} included · ${seatPrice}/add-on)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSeats(Math.max(LICENSE_SEATS_INCLUDED, seats - 1))}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>−</button>
            <div style={{ fontWeight: 800, fontSize: 17, minWidth: 26, textAlign: 'center' }}>{seats}</div>
            <button onClick={() => setSeats(Math.min(100, seats + 1))}
              style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', background: 'transparent', color: 'inherit', fontSize: 17, fontWeight: 800, cursor: 'pointer' }}>+</button>
            {addonQty > 0 && <span style={{ fontSize: 12, opacity: 0.75 }}>+{addonQty} × ${seatPrice}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 14 }}>
          {license
            ? <>Total <strong style={{ fontSize: 18 }}>{summary ? fmt(summary.totalCents) : fmt(previewCents)}</strong>/{cycle === 'annual' ? 'yr' : 'mo'}{license.cancel_at_period_end ? ' · cancels at period end' : ''}</>
            : <>Total <strong style={{ fontSize: 18 }}>{fmt(previewCents)}</strong>/{cycle === 'annual' ? 'yr' : 'mo'} · first charge today</>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!license && (
            <button onClick={subscribe} disabled={busy !== null}
              style={{ padding: '11px 22px', borderRadius: 10, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
              {busy === 'subscribe' ? 'Opening checkout…' : `Subscribe — ${fmt(previewCents)}/${cycle === 'annual' ? 'yr' : 'mo'}`}
            </button>
          )}
          {license && active && seats !== license.seats && (
            <button onClick={changeSeats} disabled={busy !== null}
              style={{ padding: '11px 18px', borderRadius: 10, background: 'var(--gold)', color: 'var(--navy)', border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer' }}>
              {busy === 'seats' ? 'Updating…' : `Update seats (${fmt(previewCents)}/${cycle === 'annual' ? 'yr' : 'mo'})`}
            </button>
          )}
          {license && active && !license.cancel_at_period_end && (
            <button onClick={() => toggleCancel(true)} disabled={busy !== null}
              style={{ padding: '11px 16px', borderRadius: 10, background: 'transparent', border: '1px solid var(--line)', color: 'inherit', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
              Cancel at period end
            </button>
          )}
          {license && active && license.cancel_at_period_end && (
            <button onClick={() => toggleCancel(false)} disabled={busy !== null}
              style={{ padding: '11px 16px', borderRadius: 10, background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer' }}>
              Resume subscription
            </button>
          )}
        </div>
      </div>

      {!license && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.15)', fontSize: 12, opacity: 0.7 }}>
          {LICENSE_SEATS_INCLUDED} seats included · ${SEAT_ADDON_MONTHLY}/seat/mo after (annual seat ${SEAT_ADDON_ANNUAL}, 2 months free parity) · cancel anytime · prorated seat changes
        </div>
      )}
    </div>
  )
}
