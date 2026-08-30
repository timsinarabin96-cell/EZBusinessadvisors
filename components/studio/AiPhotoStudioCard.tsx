/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/authToken'
import { buildAiPhotoPrompt, aiPhotoStyleById, AI_PHOTO_STYLES, type GeneratedAiImage } from '@/lib/aiPhotos'

// =============================================================================
// AI Photo Studio Card — generate 4 AI photo options and commit picks to the
// listing gallery. Lives in the Deal Studio (capture form + verify rail) so a
// broker can generate photos even after Auto-Build advanced the deal.
// =============================================================================

export default function AiPhotoStudioCard({
  listingId,
  businessName,
  industry,
  subIndustry,
  location,
  description,
  onAdded,
}: {
  listingId: string | null | undefined
  businessName?: string | null
  industry?: string | null
  subIndustry?: string | null
  location?: string | null
  description?: string | null
  onAdded?: (urls: string[]) => void
}) {
  const toast = useToast()
  const [styleId, setStyleId] = useState('realistic')
  const [prompt, setPrompt] = useState('')
  const [touched, setTouched] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [committing, setCommitting] = useState<string | null>(null)
  const [options, setOptions] = useState<GeneratedAiImage[]>([])
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Suggested prompt tracks the deal record + chosen style until edited.
  useEffect(() => {
    if (touched) return
    setPrompt(buildAiPhotoPrompt({ businessName, industry, subIndustry, location, description }, aiPhotoStyleById(styleId)))
  }, [touched, styleId, businessName, industry, subIndustry, location, description])

  const generate = async () => {
    if (generating || prompt.trim().length < 3) return
    setGenerating(true)
    setOptions([])
    setAdded(new Set())
    try {
      const res = await fetch('/api/listings/ai-photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ listingId: listingId || undefined, prompt: prompt.trim(), count: 4 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'AI photo generation failed')
      setOptions(json.images || [])
      setProviderLabel(json.providerLabel || null)
      if (json.failed > 0) toast(`${json.failed} option${json.failed === 1 ? '' : 's'} failed — showing the rest`, 'error')
      if (json.images?.length === 0) toast('No options generated — try again', 'error')
    } catch (e: any) {
      toast(e.message || 'AI photo generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  /** Commit one pick to the listing gallery (persists to image_urls). */
  const add = async (url: string) => {
    if (added.has(url) || committing) return
    setCommitting(url)
    try {
      if (listingId) {
        const res = await fetch('/api/listings/ai-photos', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ action: 'commit', listingId, urls: [url] }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save photo')
      }
      setAdded((prev) => new Set(prev).add(url))
      onAdded?.([url])
      toast('AI photo saved to the listing gallery', 'success')
    } catch (e: any) {
      toast(e.message || 'Could not save photo', 'error')
    } finally {
      setCommitting(null)
    }
  }

  const resetPrompt = () => {
    setTouched(false)
    setPrompt(buildAiPhotoPrompt({ businessName, industry, subIndustry, location, description }, aiPhotoStyleById(styleId)))
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 15 }}>✨</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>AI Photo Studio</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        Generate 4 professional photo options with AI — pick your favorite and it's saved straight to the listing gallery.
        {providerLabel && <span style={{ display: 'block', marginTop: 3, fontWeight: 700, color: '#4c1d95' }}>⚡ Generated with {providerLabel}</span>}
      </div>

      <textarea
        className="textarea"
        rows={3}
        value={prompt}
        onChange={(e) => { setPrompt(e.target.value); setTouched(true) }}
        placeholder="Describe the business photo you want…"
        style={{ fontSize: 12.5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {AI_PHOTO_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setStyleId(s.id); setTouched(false) }}
            style={{
              padding: '3px 9px', borderRadius: 999, border: '1px solid #cbb8f0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: styleId === s.id ? '#4c1d95' : '#fff', color: styleId === s.id ? '#fff' : '#4c1d95',
            }}
          >
            {s.label}
          </button>
        ))}
        {touched && (
          <button type="button" onClick={resetPrompt} style={{ marginLeft: 'auto', padding: '3px 9px', borderRadius: 999, border: '1px dashed #94a3b8', background: 'transparent', fontSize: 11, color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
            ↺ Reset
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={generating || prompt.trim().length < 3}
        style={{
          width: '100%', marginTop: 12, padding: '10px', borderRadius: 8, border: 'none', cursor: generating ? 'wait' : 'pointer',
          background: 'linear-gradient(135deg,#4c1d95,#2563eb)', color: '#fff', fontSize: 12.5, fontWeight: 800,
          opacity: generating || prompt.trim().length < 3 ? 0.6 : 1,
        }}
      >
        {generating ? '🎨 Generating 4 options…' : '🎨 Generate 4 photo options'}
      </button>

      {(generating || options.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 12 }}>
          {generating
            ? Array.from({ length: 4 }, (_, i) => (
                <div key={i} style={{ aspectRatio: '1/1', borderRadius: 8, background: 'linear-gradient(110deg,#ece5fa 30%,#f8f4ff 50%,#ece5fa 70%)', backgroundSize: '200% 100%', animation: 'aiShimmer 1.2s infinite linear' }} />
              ))
            : options.map((o) => (
                <div key={o.url} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #d8c8ff', background: '#fff' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.url} alt={`AI option ${o.seed}`} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                  <button
                    type="button"
                    onClick={() => add(o.url)}
                    disabled={added.has(o.url) || committing === o.url}
                    style={{
                      width: '100%', padding: '5px 0', borderRadius: 0, border: 'none', fontSize: 11, fontWeight: 800, cursor: added.has(o.url) ? 'default' : 'pointer',
                      background: added.has(o.url) ? '#e2e8f0' : '#4c1d95', color: added.has(o.url) ? '#64748b' : '#fff',
                    }}
                  >
                    {committing === o.url ? 'Saving…' : added.has(o.url) ? '✓ Saved to gallery' : '➕ Save to gallery'}
                  </button>
                </div>
              ))}
        </div>
      )}
      <style>{`@keyframes aiShimmer { to { background-position: -200% 0 } }`}</style>
    </div>
  )
}
