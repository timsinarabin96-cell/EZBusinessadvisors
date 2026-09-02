/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// Agent Hiring — packages, public application, and broker review pipeline.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { LoadingState } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'

interface HiringPackage {
  id: string
  name: string
  role: string
  description: string
  commission_split: number | string
  base_compensation: number | string | null
  training_required: boolean
  certification_required: boolean
  permissions: Record<string, unknown>
}

interface Application {
  id: string
  full_name: string
  email: string
  phone: string | null
  experience: string | null
  status: string
  submitted_at: string | null
  hiring_packages: { name: string; commission_split: number | string } | null
}

export function HiringPanel() {
  const toast = useToast()
  const [packages, setPackages] = useState<HiringPackage[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', experience: '', package_id: '' })
  const [submitting, setSubmitting] = useState(false)
  const [agencyId, setAgencyId] = useState('')
  const [sharing, setSharing] = useState('')

  const trainingRequest = useCallback(async (path: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession()
    return fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, ...(init?.headers || {}) },
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [pkgRes, appRes, trainingRes] = await Promise.all([
      fetch('/api/hiring/packages').then((r) => r.json().catch(() => ({}))),
      fetch('/api/hiring/applications').then((r) => r.json().catch(() => ({}))),
      trainingRequest('/api/training/share').then((r) => r.json().catch(() => ({}))),
    ])
    if (pkgRes.ok) setPackages(pkgRes.packages || [])
    if (appRes.ok) setApps(appRes.applications || [])
    if (trainingRes.ok) setAgencyId(trainingRes.agencyId || '')
    setLoading(false)
  }, [trainingRequest])

  useEffect(() => { load() }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.full_name.trim() || !form.email.trim()) return toast('Name and email are required', 'error')
    setSubmitting(true)
    const res = await fetch('/api/hiring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, package_id: form.package_id || null }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) return toast(data.error || 'Submission failed', 'error')
    setForm({ full_name: '', email: '', phone: '', experience: '', package_id: '' })
    toast('Application submitted — we will review and be in touch.', 'success')
  }

  const generateOffer = (a: Application) => {
    const win = window.open('', '_blank')
    if (!win) return
    const pkg = a.hiring_packages
    const split = pkg && pkg.commission_split != null ? `${Number(pkg.commission_split)}%` : '—'
    win.document.write(`<!DOCTYPE html><html><head><title>Offer Letter — ${a.full_name}</title><style>
      body{font-family:Georgia,serif;color:#1a2332;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.7}
      .brand{font-size:22px;font-weight:800;letter-spacing:.5px}.sub{font-size:10px;letter-spacing:.25em;color:#c9a84c;text-transform:uppercase;margin-top:2px}
      h1{font-size:26px;margin:32px 0 6px}.meta{color:#666;font-size:14px;margin-bottom:24px}
      .box{border:1px solid #e5e2d8;border-radius:10px;padding:18px 22px;margin:18px 0;font-size:15px}
      .sig{margin-top:48px;font-size:14px}.rule{border-top:1px solid #e5e2d8;margin-top:56px;padding-top:14px;font-size:12px;color:#8a8678}
    </style></head><body>
      <div class="brand">CONCORD</div><div class="sub">Deal Platform</div>
      <h1>Agent Offer Letter</h1>
      <div class="meta">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <p>Dear ${a.full_name},</p>
      <p>Congratulations! Following your interview, we are pleased to offer you a position as a licensed business intermediary with CONCORD Deal Platform.</p>
      <div class="box">
        <div><strong>Package:</strong> ${pkg?.name || 'Standard agent package'}</div>
        <div style="margin-top:6px"><strong>Commission split:</strong> ${split}</div>
        <div style="margin-top:6px"><strong>Start:</strong> Upon completion of onboarding and CBI certification</div>
      </div>
      <p>Your first step is completing the 12-module Certified Business Intermediary program — training, certification, and your broker toolkit are provided. We're excited to have you on the team.</p>
      <div class="sig">Warm regards,<br/>The CONCORD Team</div>
      <div class="rule">This offer is contingent on completed onboarding, background review, and any state licensing requirements.</div>
    </body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  const review = async (id: string, action: string) => {
    const res = await fetch('/api/hiring/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: id, action }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return toast(data.error || 'Action failed', 'error')
    toast(`Application ${action}.`, 'success')
    load()
  }

  const shareTraining = async (application: Application) => {
    if (!agencyId) return toast('Agency admin access is required to share training.', 'error')
    setSharing(application.id)
    const res = await trainingRequest('/api/training/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType: 'email', email: application.email, agencyId }),
    })
    const data = await res.json().catch(() => ({}))
    setSharing('')
    if (!res.ok) return toast(data.error || 'Could not share training', 'error')
    toast(data.mode === 'profile' ? 'Training assigned and emailed.' : 'Invitation and training link emailed.', 'success')
  }

  if (loading) return <LoadingState label="Loading hiring..." />

  return (
    <div>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>Agent Hiring</h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 24px' }}>
        Hiring packages define role, commission split, training + certification requirements, and permissions.
      </p>

      {/* Packages */}
      <h2 style={{ fontSize: 19, margin: '0 0 14px' }}>Hiring Packages</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 32 }}>
        {packages.map((p) => (
          <article key={p.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 16 }}>{p.name}</strong>
              <span style={{ fontSize: 12, background: '#f1f5f9', padding: '3px 10px', borderRadius: 20 }}>{p.role}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, margin: '10px 0 2px' }}>
              {Number(p.commission_split)}% <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>split</span>
            </div>
            {p.base_compensation != null && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Base: ${Number(p.base_compensation).toLocaleString()}/yr</div>
            )}
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '10px 0' }}>{p.description}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {p.training_required && <span style={{ fontSize: 11, background: '#eef2ff', color: '#3730a3', padding: '3px 10px', borderRadius: 20 }}>Training required</span>}
              {p.certification_required && <span style={{ fontSize: 11, background: '#ecfdf5', color: '#065f46', padding: '3px 10px', borderRadius: 20 }}>Certification required</span>}
            </div>
          </article>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 24 }} className="buyer-profile-grid">
        {/* Apply */}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontSize: 19, margin: '0 0 4px' }}>Join the team</h2>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 18px' }}>Submit an advisor application — pick a package.</p>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label><span className="label">Full name *</span><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
            <label><span className="label">Email *</span><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
            <label><span className="label">Phone</span><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label><span className="label">Desired package</span>
              <select className="select" value={form.package_id} onChange={(e) => setForm({ ...form, package_id: e.target.value })}>
                <option value="">Select…</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({Number(p.commission_split)}% split)</option>)}
              </select>
            </label>
            <label><span className="label">Experience</span><textarea className="textarea" rows={3} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} /></label>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Application'}</button>
          </form>
        </section>

        {/* Review pipeline */}
        <section style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontSize: 19, margin: '0 0 14px' }}>Applications ({apps.length})</h2>
          {apps.length === 0 ? (
            <div style={{ color: 'var(--muted)', padding: 30, textAlign: 'center' }}>No applications yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {apps.map((a) => (
                <div key={a.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{a.full_name}</strong>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.email}{a.hiring_packages ? ` · ${a.hiring_packages.name}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, background: '#f1f5f9', padding: '3px 10px', borderRadius: 20 }}>{a.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => review(a.id, 'reviewing')}>Reviewing</button>
                    <button className="btn" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => review(a.id, 'interview')}>Interview</button>
                    <button className="btn btn-primary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => review(a.id, 'approved')}>Approve</button>
                    {a.status === 'approved' && (
                      <button className="btn" style={{ padding: '5px 12px', fontSize: 12, background: '#fdf6e3', borderColor: '#e8d9a8' }} onClick={() => generateOffer(a)}>
                        📄 Offer letter
                      </button>
                    )}
                    {a.status === 'approved' && (
                      <button className="btn" disabled={sharing === a.id} style={{ padding: '5px 12px', fontSize: 12, background: '#eef6ff', borderColor: '#bfd8f2' }} onClick={() => void shareTraining(a)}>
                        {sharing === a.id ? 'Sharing…' : '🎓 Share training'}
                      </button>
                    )}
                    <button className="btn" style={{ padding: '5px 12px', fontSize: 12, color: '#b91c1c' }} onClick={() => review(a.id, 'rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
