'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrainingModule, TrainingProgress, TrainingCertificate, TrainingUpload,
  fetchModules, fetchProgress, fetchCertificates, fetchUploads, ensureProgramCertificate,
} from '@/lib/training'
import { Card, CardHeader, StatCard, LoadingState, EmptyState, Badge } from '@/components/ui'
import TrainingCertificatesSection from './TrainingCertificatesSection'
import TrainingGamificationCard from './TrainingGamificationCard'
import TrainingSimulator from './TrainingSimulator'

export default function TrainingDashboard() {
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [progress, setProgress] = useState<TrainingProgress[]>([])
  const [certs, setCerts] = useState<TrainingCertificate[]>([])
  const [uploads, setUploads] = useState<TrainingUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [programCert, setProgramCert] = useState<TrainingCertificate | null>(null)

  useEffect(() => {
    (async () => {
      try {
        // Load modules INDEPENDENTLY of the aux calls so the module grid
        // always renders even if progress/certs/uploads fail (they hit the
        // anon client + RLS and can throw when the session is stale). If any
        // sibling Promise rejects, Promise.all discards ALL results including
        // the 10 modules — that was the root cause of the blank dashboard.
        const m = await fetchModules()
        setModules(m)
      } catch (e) {
        console.error('Failed to load modules:', e)
        setModules([])
      }
      setLoading(false)

      const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((e) => {
        console.warn('Aux training fetch failed (non-fatal):', e)
        return fallback
      })
      const [p, c, u] = await Promise.all([
        safe(fetchProgress(getBrokerId()), []),
        safe(fetchCertificates(getBrokerId()), []),
        safe(fetchUploads(), []),
      ])
      setProgress(p)
      setCerts(c)
      setUploads(u)

      // Auto-issue the full CBI program certificate when all modules are
      // certified — the “Business Intermediary Course Completion” award.
      const prog = await safe(ensureProgramCertificate(getBrokerId()), null)
      if (prog) setProgramCert(prog)
    })()
  }, [])

  const completedIds = new Set(progress.filter((x) => x.completed).map((x) => x.lesson_id))
  const certModuleIds = new Set(certs.map((c) => c.module_id))
  const totalLessons = modules.reduce((n, m) => n + (m.lesson_count || 0), 0)

  if (loading) return <LoadingState label="Loading Training Center..." />

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Training</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Certified Business Intermediary (CBI) Program — master brokerage fundamentals, complete all {modules.length} modules, and your certificate is issued right here at the end.
          </p>
        </div>
        <Link href="/dashboard/training/upload" className="btn" style={{ textDecoration: 'none' }}>
          + Upload Training Material
        </Link>
      </header>

      {/* CBI Program banner — full-program progress + completion certificate */}
      <Card style={{ marginBottom: 24, background: 'linear-gradient(120deg, #0f2038, #14294f)', border: 'none' }}>
        <div style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 44 }}>🏆</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: 'var(--gold)', fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              Certified Business Intermediary
            </div>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif', margin: '4px 0' }}>
              {programCert ? 'Course Completion — Certificate Earned! 🎉' : 'Business Intermediary Course Completion'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, maxWidth: 560 }}>
              {programCert
                ? 'Congratulations! Complete all the modules and you earned the full program certificate — downloadable below with your name, agency, and logo.'
                : `Earn your certificate by completing all ${modules.length} modules (${certs.length}/${modules.length} certified). Each module unlocks after its lessons and quiz are done.`}
            </div>
          </div>
          <div style={{ minWidth: 200 }}>
            {programCert ? (
              <a href="#certificates" className="btn" style={{ textDecoration: 'none', background: 'var(--gold)', borderColor: 'var(--gold)', color: '#fff', width: '100%', textAlign: 'center' }}>
                🎓 View Certificate ↓
              </a>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', fontSize: 13, marginBottom: 6 }}>
                  <span>Program progress</span>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{certs.length}/{modules.length} modules</span>
                </div>
                <ProgressBar pct={modules.length ? Math.round((certs.length / modules.length) * 100) : 0} height={8} />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Gamification — XP, streak, and CBI title ladder */}
      <TrainingGamificationCard />

      {/* Deal Simulator — learn-by-doing */}
      <TrainingSimulator />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Modules" value={modules.length} icon="📘" />
        <StatCard label="Lessons Completed" value={completedIds.size} icon="✅" accent="#22c55e" />
        <StatCard label="Certificates" value={certs.length} icon="🏆" accent="#f59e0b" />
        <StatCard label="Materials" value={uploads.length} icon="📁" accent="#8b5cf6" />
      </div>

      {/* Overall progress */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader title="Overall Progress" subtitle="Across all modules" />
        <div style={{ padding: 20 }}>
          <ProgressBar pct={totalLessons ? Math.round((completedIds.size / totalLessons) * 100) : 0} />
        </div>
      </Card>

      {/* Module grid */}
      <h2 style={{ fontSize: 20, marginBottom: 12 }}>Your Learning Path</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {modules.length === 0 && (
          <Card style={{ gridColumn: '1 / -1' }}>
            <EmptyState icon="📚" title="No modules yet" subtitle="Run training_schema.sql + training seed to populate modules." />
          </Card>
        )}
        {modules.map((m) => {
          const mc = m.lesson_count || 0
          const cc = m.completed_count || 0
          const pct = mc ? Math.round((cc / mc) * 100) : 0
          const certified = certModuleIds.has(m.id)
          return (
            <Link key={m.id} href={`/dashboard/training/${m.id}`} style={{ textDecoration: 'none' }}>
              <Card style={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'transform .15s, box-shadow .15s' }}>
                <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 34 }}>{m.icon || '📘'}</div>
                  <div style={{ flex: 1 }}>
                    <Badge color="#c9a84c">Module {m.order}</Badge>
                    {certified && <Badge color="#22c55e">Certified</Badge>}
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginTop: 4 }}>
                      {m.title}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '0 20px 6px', color: 'var(--muted)', fontSize: 13, flex: 1 }}>
                  {m.description}
                </div>
                <div style={{ padding: '12px 20px 18px' }}>
                  <ProgressBar pct={pct} height={6} />
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {cc} of {mc} lessons · {pct}% complete
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {/* Certificates — inline at the END of the tab (course → test → certificate) */}
      <TrainingCertificatesSection certs={certs} programCert={programCert} modules={modules} />

      {/* Recent uploads */}
      {uploads.length > 0 && (
        <Card style={{ marginTop: 24 }}>
          <CardHeader title="Recent Training Materials" subtitle="Uploaded by the team" />
          <div style={{ padding: '8px 20px 20px' }}>
            {uploads.slice(0, 5).map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{fileIcon(u.file_type)}</span>
                <a href={u.file_url} target="_blank" rel="noreferrer" style={{ flex: 1, color: 'var(--navy)', textDecoration: 'none', fontWeight: 600 }}>
                  {u.title}
                </a>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(u.uploaded_at || Date.now()).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function ProgressBar({ pct, height = 10 }: { pct: number; height?: number }) {
  return (
    <div style={{ background: 'var(--line)', borderRadius: 999, height, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height, background: 'linear-gradient(90deg, var(--gold-light), var(--gold))', borderRadius: 999, transition: 'width .4s' }} />
    </div>
  )
}

function fileIcon(t: string) {
  const map: Record<string, string> = { pdf: '📕', video: '🎬', doc: '📝', xlsx: '📊', ppt: '📽️' }
  return map[t] || '📄'
}

// NOTE: replace with real current-user profile id passed from the page for
// multi-broker correctness. Falls back to a local-storage stub so the demo
// renders without auth wiring.
export function getBrokerId(): string {
  if (typeof window === 'undefined') return ''
  const stored = window.localStorage.getItem('concord_broker_id')
  if (stored) return stored
  const id = 'broker-' + Math.random().toString(36).slice(2, 10)
  window.localStorage.setItem('concord_broker_id', id)
  return id
}
