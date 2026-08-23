'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider } from '@/components/ui/Toast'
import { forensicScanForAgency, type RedFlagReport } from '@/lib/redFlag'

const SEV_COLOR: Record<string, string> = { high: '#b00020', medium: '#b45309', low: '#0e7490' }
const BAND_COLOR: Record<string, string> = { high: '#b00020', moderate: '#b45309', low: '#0e7490', clean: '#1e7e34' }
const BAND_LABEL: Record<string, string> = { high: 'High risk', moderate: 'Moderate', low: 'Low', clean: 'Clean' }

interface ScanRow {
  listingId: string
  businessName: string | null
  report: RedFlagReport
}

export default function RedFlagsPage() {
  return (
    <AppShell active="Red Flags">
      <ToastProvider>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px 60px' }}>
          <FlagsBody />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function FlagsBody() {
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const scan = await forensicScanForAgency()
    setRows(scan)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const risky = rows.filter((r) => r.report.score >= 35).length
  const clean = rows.filter((r) => r.report.score < 12).length

  return (
    <>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', margin: 0 }}>Red-Flag Forensics 🔎</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14, maxWidth: 660 }}>
          Scans each listing&apos;s recast financials for the patterns buyers and lenders fear most: revenue spikes before listing, aggressive add-backs, one-time-item dominance, and margin anomalies. Verify before you market — not after a buyer walks.
        </p>
      </div>

      {loading ? <LoadingState /> : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔎</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)' }}>No financial histories to scan yet</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Listings with recast financial data (financial_history + add-backs) appear here automatically.</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
            <Stat label="Listings scanned" value={String(rows.length)} accent="#102a43" />
            <Stat label="Need verification" value={String(risky)} accent="#b00020" />
            <Stat label="Clean" value={String(clean)} accent="#1e7e34" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map((r) => (
              <div key={r.listingId} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>{r.businessName || 'Confidential listing'}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{r.report.summary}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: BAND_COLOR[r.report.riskBand], lineHeight: 1 }}>{r.report.score}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: BAND_COLOR[r.report.riskBand], textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>{BAND_LABEL[r.report.riskBand]}</div>
                  </div>
                </div>
                <div style={{ height: 8, background: '#eef2f5', borderRadius: 99, marginTop: 14, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.report.score}%`, background: BAND_COLOR[r.report.riskBand], borderRadius: 99, transition: 'width .4s ease' }} />
                </div>
                {r.report.flags.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                    {r.report.flags.map((f) => (
                      <div key={f.code} style={{ padding: 12, borderRadius: 10, background: `${SEV_COLOR[f.severity]}08`, border: `1px solid ${SEV_COLOR[f.severity]}30` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: SEV_COLOR[f.severity], padding: '3px 8px', borderRadius: 999, background: `${SEV_COLOR[f.severity]}15` }}>{f.severity}</span>
                          <span style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{f.title}</span>
                          {f.magnitude && <span style={{ fontSize: 12, fontWeight: 800, color: SEV_COLOR[f.severity] }}>{f.magnitude}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#5b6b7c', marginTop: 5, lineHeight: 1.55 }}>{f.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <p style={{ color: '#9aa5b1', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
            Deterministic pattern scan — advisory only. Every flag is a &quot;verify this&quot; signal, not an accusation.
          </p>
        </>
      )}
    </>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
    <div style={{ fontSize: 26, color: accent, fontWeight: 800, marginTop: 4 }}>{value}</div>
  </div>
}
