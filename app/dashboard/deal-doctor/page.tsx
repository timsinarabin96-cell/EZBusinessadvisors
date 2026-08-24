'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { diagnosePipeline, BAND_LABELS, BAND_COLORS, type DealDiagnosis, type DealBand } from '@/lib/dealDoctor'

const BAND_ORDER: DealBand[] = ['hot', 'healthy', 'at_risk', 'stale']

export default function DealDoctorPage() {
  return (
    <AppShell active="Deal Doctor">
      <ToastProvider>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 60px' }}>
          <DoctorBody />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function DoctorBody() {
  const toast = useToast()
  const [diagnoses, setDiagnoses] = useState<DealDiagnosis[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { diagnoses } = await diagnosePipeline()
    setDiagnoses(diagnoses)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts: Record<DealBand, number> = { hot: 0, healthy: 0, at_risk: 0, stale: 0 }
  for (const d of diagnoses) counts[d.band] += 1
  const avg = diagnoses.length ? Math.round(diagnoses.reduce((s, d) => s + d.score, 0) / diagnoses.length) : 0

  const createFollowUp = async (d: (typeof diagnoses)[number]) => {
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        quick: { dealId: d.dealId },
        title: `Follow up: ${d.action}`,
        due_at: new Date(Date.now() + 3 * 86400000).toISOString(),
        assignToMe: true,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Could not create reminder', 'error')
    toast('Follow-up reminder set for 3 days ⏰', 'success')
  }

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Deal Doctor 🩺</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 640 }}>
          Probability-of-close for every deal in your pipeline, scored from stage, momentum, buyer engagement, and pricing. Push the hot ones, fix the risky ones, drop the stale ones.
        </p>
      </div>

      {loading ? <LoadingState /> : diagnoses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🩺</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>No active deals to diagnose</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Deals appear here once they hit your pipeline (LOI → closed).</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            <StatCard label="Active deals" value={String(diagnoses.length)} accent="#102a43" />
            <StatCard label="Avg close score" value={`${avg}%`} accent="#0e7490" />
            {BAND_ORDER.map((b) => (
              <StatCard key={b} label={BAND_LABELS[b]} value={String(counts[b])} accent={BAND_COLORS[b]} />
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {diagnoses.map((d) => (
              <div key={d.dealId} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>{d.businessName || 'Confidential deal'}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{d.stageLabel}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 30, fontWeight: 800, color: BAND_COLORS[d.band], lineHeight: 1 }}>{d.score}%</div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: BAND_COLORS[d.band], textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{d.band}</div>
                  </div>
                </div>
                <div style={{ height: 8, background: '#eef2f5', borderRadius: 99, marginTop: 14, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.score}%`, background: BAND_COLORS[d.band], borderRadius: 99, transition: 'width .4s ease' }} />
                </div>
                <div style={{ fontSize: 13.5, color: '#1e7e34', fontWeight: 700, marginTop: 12 }}>💡 {d.action}</div>
                <button
                  onClick={() => createFollowUp(d)}
                  style={{
                    marginTop: 10, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                    background: '#fff', border: '1px solid var(--line)', color: 'var(--navy)',
                    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                  }}
                >
                  🔁 Create follow-up reminder
                </button>
                {d.factors.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {d.factors.map((f) => <span key={f} style={{ padding: '5px 9px', background: '#f5f8fb', border: '1px solid #e3eef4', borderRadius: 999, fontSize: 11.5, color: '#5b6b7c', fontWeight: 600 }}>{f}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ color: '#9aa5b1', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
            Advisory scoring from stage, velocity, engagement, and pricing — combine with broker judgment.
          </p>
        </>
      )}
    </>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 26, color: accent, fontWeight: 800, marginTop: 4 }}>{value}</div>
  </div>
}
