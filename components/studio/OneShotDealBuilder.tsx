/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'
import { createListing, fetchListing } from '@/lib/listings'
import { ONE_SHOT_STAGES, type BuildStep } from '@/lib/oneShotDeal'
import AiPhotoStudioCard from '@/components/studio/AiPhotoStudioCard'

// =============================================================================
// OneShotDealBuilder — THE HEART of the platform.
// -----------------------------------------------------------------------------
// One screen. One input (paste notes / drop docs). One button:
// "Build Entire Deal". A streaming AI pipeline fills the record, reads the
// financials, recasts, generates BOV/CIM/BLI, checks SBA, prices against
// comps, matches buyers, generates photos and writes the teaser — with a live
// progress trail — then one "Approve & Go Live" publishes it.
// =============================================================================

export interface DealBuildResult {
  ok: boolean
  listingId: string
  listing?: any
  steps?: BuildStep[]
  audit?: any
  valuation?: any
  buyerCount?: number
  photos?: string[]
  readiness?: any
  failed?: number
}

export default function OneShotDealBuilder() {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [phase, setPhase] = useState<'intake' | 'building' | 'deal'>('intake')
  const [steps, setSteps] = useState<BuildStep[]>(ONE_SHOT_STAGES.map((s) => ({ key: s.key, label: s.label, status: 'pending' })))
  const [listingId, setListingId] = useState<string | null>(null)
  const [result, setResult] = useState<DealBuildResult | null>(null)
  const [listing, setListing] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [publishing, setPublishing] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Resume a deep link ?listing=<id> → straight to the deal review.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('listing')
    if (id) {
      setListingId(id)
      loadDeal(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDeal = async (id: string) => {
    setPhase('deal')
    try {
      const l = await fetchListing(id)
      setListing(l)
      const res = await fetch(`/api/listings/options?listingId=${id}`, { headers: authHeaders() }).catch(() => null)
      void res
      // Documents (generated BOV/CIM/BLI + uploads).
      const supabase = (await import('@/lib/supabase/client')).supabase
      const { data } = await supabase.from('financial_documents').select('*').eq('listing_id', id).order('uploaded_at', { ascending: false }).limit(20)
      setDocs((data || []).filter((d: any) => /generated|recast|bov|cim|bli/i.test(String(d.category || '') + String(d.file_name || '')) || !/generated/i.test(String(d.file_name || ''))))
    } catch (e: any) {
      setError(e.message || 'Could not load the deal')
    }
  }

  const build = async () => {
    if (phase === 'building') return
    if (!notes.trim() && files.length === 0) {
      toast('Paste broker notes or upload at least one document first', 'error')
      return
    }
    setError(null)
    setPhase('building')
    setSteps(ONE_SHOT_STAGES.map((s) => ({ key: s.key, label: s.label, status: 'pending' })))

    try {
      // 1. Ensure a draft listing exists.
      let id = listingId
      if (!id) {
        const firstLine = notes.split('\n')[0].trim().slice(0, 60) || 'Untitled deal'
        const created = await createListing({
          business_name: firstLine,
          status: 'active',
          description: notes.trim().slice(0, 2000) || null,
        } as any)
        id = created.id
        setListingId(id)
      }

      // 2. Upload each financial doc.
      for (const f of files) {
        const fd = new FormData()
        fd.append('file', f)
        fd.append('listingId', id)
        await fetch('/api/listings/financial-import', {
          method: 'POST',
          headers: authHeaders(),
          body: fd,
        }).catch((e) => console.error('doc upload failed', e))
      }

      // 3. Stream the build pipeline.
      const res = await fetch('/api/deals/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId: id, notes }),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Build failed to start')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let done = false
      let final: DealBuildResult | null = null
      while (!done) {
        const { value, done: streamDone } = await reader.read()
        done = streamDone
        buf += decoder.decode(value || new Uint8Array(), { stream: !done })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'step' && ev.step?.key) {
              setSteps((prev) => prev.map((s) => (s.key === ev.step.key ? ev.step : s)))
            } else if (ev.type === 'done') {
              final = ev.result
            } else if (ev.type === 'error') {
              setError(ev.error)
            }
          } catch { /* partial line */ }
        }
      }
      if (!final) throw new Error(error || 'Build finished without a result')
      setResult(final)
      setSteps(final.steps || [])
      if (final.failed) toast(`${final.failed} step${final.failed === 1 ? '' : 's'} need attention — see the trail`, 'error')
      else toast('Deal built — everything generated', 'success')
      await loadDeal(final.listingId)
    } catch (e: any) {
      setError(e.message || 'Build failed')
      setPhase('intake')
    }
  }

  const goLive = async () => {
    if (!listingId || publishing) return
    setPublishing(true)
    try {
      const res = await fetch('/api/listings/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId, force: true }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Publish failed')
      toast('🚀 Listing is LIVE on the marketplace', 'success')
      setListing({ ...listing, status: 'active' })
    } catch (e: any) {
      toast(e.message || 'Publish failed', 'error')
    } finally {
      setPublishing(false)
    }
  }

  const icon = (s: BuildStep) =>
    s.status === 'running' ? '⏳' : s.status === 'done' ? '✅' : s.status === 'skipped' ? '⏭️' : s.status === 'failed' ? '❌' : '○'

  const gallery = Array.isArray(listing?.image_urls) ? listing.image_urls : []

  return (
    <div>
      {phase === 'intake' && (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {/* HERO */}
          <div style={{ textAlign: 'center', padding: '26px 10px 8px' }}>
            <div style={{ fontSize: 34 }}>🤖</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 30, margin: '8px 0 6px', color: 'var(--navy)' }}>One-Shot Deal Builder</h1>
            <p style={{ color: 'var(--muted)', fontSize: 14.5, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              Paste broker notes, a call transcript, or drop the financial documents — the AI builds the entire deal:
              record, verified financials, recast, BOV/CIM/BLI, SBA check, comps valuation, buyer matches, photos and teaser.
              One review, one Go Live.
            </p>
          </div>

          {/* INTAKE */}
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: 20, marginTop: 18, boxShadow: '0 10px 30px rgba(16,42,67,0.06)' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)', marginBottom: 8 }}>📝 What do you know about the deal?</div>
            <textarea
              className="textarea"
              rows={7}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'Paste anything… e.g.\n\n"Corner laundromat in Harrisburg, 24 machines + drop-off service. Asking $350k, gross ~$180k, owner works 30h/wk. Lease is $4,200/mo with 8 years left. Owner retiring, will train 3 weeks. Two employees."'}
              style={{ fontSize: 14, lineHeight: 1.6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{ padding: '9px 16px', borderRadius: 9, border: '1px dashed #94a3b8', background: '#f8fafc', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'var(--navy)' }}
              >
                📎 Attach financial documents {files.length > 0 ? `(${files.length})` : ''}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls,.csv,image/*"
                style={{ display: 'none' }}
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 10))}
              />
              {files.length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{files.map((f) => f.name).join(', ').slice(0, 120)}</span>
              )}
            </div>
            <button
              type="button"
              onClick={build}
              style={{
                width: '100%', marginTop: 16, padding: '15px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg,#c9a84c,#b08d2e)', color: '#0f1023', fontWeight: 800, fontSize: 16,
                fontFamily: 'Georgia, serif', boxShadow: '0 8px 24px rgba(201,168,76,0.4)',
              }}
            >
              🚀 Build Entire Deal
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              The pipeline runs ~11 AI stages — record → docs → audit → recast → BOV/CIM/BLI → SBA → comps → buyers → photos → teaser → readiness.
            </div>
            {error && <div style={{ marginTop: 10, fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>{error}</div>}
          </div>
        </div>
      )}

      {phase === 'building' && (
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ background: 'linear-gradient(135deg,#0f1023,#1a1a2e)', borderRadius: 16, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 22 }}>⚡</span>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f5d97a', fontFamily: 'Georgia, serif' }}>Building your deal…</div>
            </div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
              The AI is reading, verifying and generating. This can take a minute — every stage updates live below.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((s) => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13 }}>
                  <span style={{ width: 20, textAlign: 'center' }}>{icon(s)}</span>
                  <span style={{
                    color: s.status === 'failed' ? '#fca5a5' : s.status === 'done' ? '#bbf7d0' : s.status === 'skipped' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.9)',
                    fontWeight: s.status === 'running' ? 800 : 600,
                  }}>
                    {s.label}
                  </span>
                  {s.note && <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.55)', fontSize: 11.5, textAlign: 'right' }}>{s.note}</span>}
                </div>
              ))}
            </div>
            {error && <div style={{ marginTop: 14, fontSize: 12.5, color: '#fca5a5', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}
          </div>
        </div>
      )}

      {phase === 'deal' && listing && (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>The Deal</div>
              <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, margin: '4px 0 2px', color: 'var(--navy)' }}>
                {listing.business_name || 'Untitled deal'}
              </h1>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {listing.industry || ''}{listing.industry && listing.location_general ? ' · ' : ''}{listing.location_general || ''}
                {listing.asking_price ? ` · $${Number(listing.asking_price).toLocaleString()}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {result?.readiness && (
                <div style={{ textAlign: 'center', background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 14px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: (result.readiness.score || 0) >= 70 ? '#166534' : (result.readiness.score || 0) >= 40 ? '#9a6700' : '#b91c1c' }}>
                    {result.readiness.score}/100
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 700 }}>READINESS</div>
                </div>
              )}
              <button
                type="button"
                onClick={goLive}
                disabled={publishing}
                style={{
                  padding: '13px 22px', borderRadius: 10, border: 'none', cursor: publishing ? 'wait' : 'pointer',
                  background: listing.status === 'active' ? '#16a34a' : 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff',
                  fontWeight: 800, fontSize: 14.5, boxShadow: '0 8px 20px rgba(22,163,74,0.35)',
                }}
              >
                {listing.status === 'active' ? '✓ Live on the marketplace' : publishing ? 'Publishing…' : '✅ Approve & Go Live'}
              </button>
            </div>
          </div>

          {/* AUDIT BANNER */}
          {result?.audit && (result.audit.redFlags?.length > 0) && (
            <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 13, color: '#991b1b' }}>
              <strong>⚠️ Auditor flags:</strong> {result.audit.redFlags.join(' · ')}
            </div>
          )}

          {/* SECTIONS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Record */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>📋 Deal record</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: 12.5 }}>
                  {[
                    ['Asking price', listing.asking_price ? `$${Number(listing.asking_price).toLocaleString()}` : null],
                    ['Annual revenue', listing.annual_revenue ? `$${Number(listing.annual_revenue).toLocaleString()}` : null],
                    ['SDE', listing.sde ? `$${Number(listing.sde).toLocaleString()}` : null],
                    ['EBITDA', listing.ebitda ? `$${Number(listing.ebitda).toLocaleString()}` : null],
                    ['Employees', listing.employees_full_time ? String(listing.employees_full_time) : null],
                    ['Established', listing.established_year ? String(listing.established_year) : null],
                    ['SBA', listing.sba_qualified ? '✅ Eligible' : null],
                  ].filter((r) => r[1]).map(([k, v]) => (
                    <div key={k as string} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</div>
                      <div style={{ fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {listing.description && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>{listing.description}</div>}
                <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Link href={`/dashboard/listings/${listing.id}/edit`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', background: '#f1f5f9', padding: '8px 14px', borderRadius: 8, textDecoration: 'none' }}>
                    ✏️ Edit record
                  </Link>
                  <Link href={`/dashboard/listings/${listing.id}/workflow`} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', background: '#f1f5f9', padding: '8px 14px', borderRadius: 8, textDecoration: 'none' }}>
                    📋 Workflow
                  </Link>
                </div>
              </div>

              {/* Documents */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>📄 Generated documents</div>
                {docs.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No generated documents yet — add financials and rebuild.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {docs.map((d) => (
                      <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--navy)', textDecoration: 'none', padding: '8px 10px', background: '#f8fafc', borderRadius: 8 }}>
                        📎 <span style={{ fontWeight: 700 }}>{d.file_name}</span>
                        <span style={{ marginLeft: 'auto', color: '#2563eb', fontWeight: 700 }}>Open ↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Photos */}
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 10 }}>📸 Photos</div>
                {gallery.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {gallery.slice(0, 8).map((u: string) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={u} src={u} alt="gallery" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />
                    ))}
                  </div>
                )}
                <AiPhotoStudioCard
                  listingId={listing.id}
                  businessName={listing.business_name}
                  industry={listing.industry}
                  subIndustry={listing.sub_industry}
                  location={listing.location_general}
                  description={listing.description}
                  onAdded={() => fetchListing(listing.id).then(setListing).catch(() => {})}
                />
              </div>

              {/* Buyers + valuation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>🤝 Buyer matches</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)' }}>{result?.buyerCount ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>qualified buyers matched to this industry</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 6 }}>💰 Valuation</div>
                  {result?.valuation ? (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                        ${Number(result.valuation.low).toLocaleString()} – ${Number(result.valuation.high).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{result.valuation.multiple}× {result.valuation.basis} · {result.valuation.source}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Add earnings to get a comps-based range.</div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT RAIL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 84 }}>
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>🛡️ Audit trail</div>
                {result?.audit?.figures?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {result.audit.figures.map((f: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                        <span>{f.source === 'document' ? '✅' : f.source === 'notes' ? '📝' : '🧮'}</span>
                        <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{f.field.replace('_', ' ')}</span>
                        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>${Number(f.value).toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>✅ verified from doc · 📝 from notes · 🧮 estimated</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Audit runs during the build.</div>
                )}
              </div>
              <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif', marginBottom: 8 }}>⚡ Build trail</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {steps.map((s) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                      <span>{icon(s)}</span>
                      <span style={{ color: s.status === 'failed' ? '#b91c1c' : 'var(--muted)', fontWeight: s.status === 'done' ? 700 : 500 }}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
