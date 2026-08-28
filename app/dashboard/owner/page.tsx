/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /dashboard/owner — the Business Owner portal (free tier: 1 listing, no CRM).
// Login → see my listing(s), add/refresh one, track buyer inquiries.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { CRM_MONTHLY, CRM_ENTERPRISE_MONTHLY } from '@/lib/pricing'
import { LoadingState } from '@/components/ui'

interface OwnerListing {
  id: string
  business_name: string
  status: string
  created_at: string | null
  plan_code?: string | null
}

export default function OwnerPortalPage() {
  const [email, setEmail] = useState('')
  const [listings, setListings] = useState<OwnerListing[]>([])
  const [inquiries, setInquiries] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      setEmail(user.email)
      const [ordersRes, leadsRes] = await Promise.all([
        supabase
          .from('seller_listing_orders')
          .select('id, business_name, status, created_at, plan_code')
          .eq('seller_email', user.email)
          .order('created_at', { ascending: false }),
        supabase
          .from('leads')
          .select('id')
          .eq('email', user.email)
          .eq('kind', 'buyer'),
      ])
      setListings((ordersRes.data as OwnerListing[]) || [])
      setInquiries((leadsRes.data || []).length)
    } catch { /* degrade */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState label="Loading your portal..." />

  const canAdd = listings.filter((l) => l.status !== 'canceled' && l.status !== 'expired').length < 1

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', padding: '48px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>CONCORD</div>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Owner Portal</div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '30px 28px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#1a1a2e' }}>My Business Listing</h1>
          <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#888' }}>
            Signed in as <strong>{email}</strong> · Free plan: 1 listing, no CRM. Buyers contact you confidentially through the marketplace.
          </p>

          {inquiries > 0 && (
            <div style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13.5, color: '#7a5f10' }}>
              🔔 You have {inquiries} buyer inquiry/inquiries on your listing{inquiries === 1 ? '' : 's'}.
            </div>
          )}

          {listings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 20px', background: '#faf9f4', border: '1px dashed #d8d2c2', borderRadius: 12 }}>
              <div style={{ fontSize: 38, marginBottom: 10 }}>🏪</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 18, color: '#1a1a2e', marginBottom: 6 }}>You haven't listed your business yet</div>
              <p style={{ fontSize: 13.5, color: '#888', margin: '0 0 18px' }}>
                One free listing. A broker reviews it before it goes live — then qualified buyers can reach you.
              </p>
              <Link href="/marketplace/sell" style={{ display: 'inline-block', background: '#1a1a2e', color: '#c9a84c', padding: '12px 26px', borderRadius: 8, textDecoration: 'none', fontWeight: 800, fontFamily: 'Georgia, serif' }}>
                List My Business →
              </Link>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                {listings.map((l) => (
                  <div key={l.id} style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', fontSize: 16 }}>{l.business_name}</div>
                      <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>
                        {l.created_at ? `Submitted ${new Date(l.created_at).toLocaleDateString()}` : 'Submitted'} · {l.plan_code || 'free'} plan
                      </div>
                    </div>
                    <span style={{ background: l.status === 'published' || l.status === 'active' ? '#22c55e1a' : l.status === 'pending' ? '#f59e0b1a' : '#94a3b81a', color: l.status === 'published' || l.status === 'active' ? '#15803d' : l.status === 'pending' ? '#b45309' : '#64748b', padding: '5px 14px', borderRadius: 99, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase' }}>
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
              {!canAdd && (
                <div style={{ fontSize: 13, color: '#888', background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '12px 16px' }}>
                  ℹ️ Your free plan includes 1 listing. Want more?{' '}
                  <Link href="/pricing" style={{ color: '#1a1a2e', fontWeight: 700 }}>Professional (${CRM_MONTHLY}/mo — 10 listings · 5 seats)</Link> or{' '}
                  <Link href="/pricing" style={{ color: '#1a1a2e', fontWeight: 700 }}>Enterprise (${CRM_ENTERPRISE_MONTHLY}/mo — 25 listings · 15 seats)</Link>.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          Questions? <a href="mailto:info@ezbusinessadvisors.com" style={{ color: '#c9a84c' }}>info@ezbusinessadvisors.com</a>
        </div>
      </div>
    </div>
  )
}
