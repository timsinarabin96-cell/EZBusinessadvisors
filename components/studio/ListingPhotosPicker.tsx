/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { AI_PHOTO_STYLES, type GeneratedAiImage } from '@/lib/aiPhotos'

// =============================================================================
// Listing Photos Picker (boss 08-31 rebuild) — replaces the old AI-only
// AiPhotoStudioCard. ONE picker with both paths side by side:
//   • 📤 Upload your own — agent's real photos (multipart → listing_images)
//   • ✨ Generate options — Claude writes a REAL listing-specific prompt, the
//     configured provider (FAL → OpenAI → free) renders options
// The agent mixes both in one gallery and marks any image as the cover/primary
// photo. Old templated-prompt AI path is gone — prompt now comes from Claude
// server-side (lib/aiPhotoPrompt.ts).
// =============================================================================

export default function ListingPhotosPicker({
  listingId,
  businessName,
  industry,
  subIndustry,
  location,
  description,
  gallery,
  primaryImageUrl,
  onGalleryChange,
}: {
  listingId: string | null | undefined
  businessName?: string | null
  industry?: string | null
  subIndustry?: string | null
  location?: string | null
  description?: string | null
  gallery?: string[] | null
  primaryImageUrl?: string | null
  onGalleryChange?: () => void
}) {
  const toast = useToast()
  const images = Array.isArray(gallery) ? gallery : []
  const cover = primaryImageUrl || images[0] || null

  // ── Generate state ──
  const [styleId, setStyleId] = useState('realistic')
  const [generating, setGenerating] = useState(false)
  const [committing, setCommitting] = useState<string | null>(null)
  const [options, setOptions] = useState<GeneratedAiImage[]>([])
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [promptSource, setPromptSource] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  // ── Upload state ──
  const [uploading, setUploading] = useState(false)
  const [coverBusy, setCoverBusy] = useState<string | null>(null)

  const refresh = () => onGalleryChange?.()

  const generate = async () => {
    if (generating) return
    setGenerating(true)
    setOptions([])
    setAdded(new Set())
    try {
      const res = await authenticatedFetch('/api/listings/ai-photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ listingId: listingId || undefined, styleId, count: 4 }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'AI photo generation failed')
      setOptions(json.images || [])
      setProviderLabel(json.providerLabel || null)
      setPromptSource(json.promptSource === 'claude' ? 'Claude wrote a prompt from your listing details' : json.promptSource === 'template' ? 'Fallback template prompt (Claude unavailable)' : null)
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
        const res = await authenticatedFetch('/api/listings/ai-photos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'commit', listingId, urls: [url] }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) throw new Error(json.error || 'Could not save photo')
      }
      setAdded((prev) => new Set(prev).add(url))
      toast('Photo saved to the listing gallery', 'success')
      refresh()
    } catch (e: any) {
      toast(e.message || 'Could not save photo', 'error')
    } finally {
      setCommitting(null)
    }
  }

  /** Agent's own photo upload — same gallery, mixes with AI options. */
  const onFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files || []).slice(0, 8)
    if (arr.length === 0 || !listingId) {
      if (!listingId) toast('Save the listing first, then add photos', 'error')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('listingId', listingId)
      for (const f of arr) fd.append('files', f)
      const res = await authenticatedFetch('/api/listings/ai-photos', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || 'Upload failed')
      toast(`📤 ${json.uploaded} photo${json.uploaded === 1 ? '' : 's'} uploaded to the gallery`, 'success')
      refresh()
    } catch (e: any) {
      toast(e.message || 'Upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  /** Mark one gallery image as the cover/primary photo. */
  const setCover = async (url: string) => {
    if (!listingId || coverBusy) return
    setCoverBusy(url)
    try {
      const res = await authenticatedFetch('/api/listings/ai-photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cover', listingId, url }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Could not set cover')
      toast('⭐ Cover photo set', 'success')
      refresh()
    } catch (e: any) {
      toast(e.message || 'Could not set cover', 'error')
    } finally {
      setCoverBusy(null)
    }
  }

  const hasListing = Boolean(listingId)

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 15 }}>📸</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>Listing Photos</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 10 }}>
        Upload your own photos or generate AI options — mix both in one gallery, and star the cover photo.
        {!hasListing && <span style={{ display: 'block', marginTop: 3, color: '#b45309', fontWeight: 700 }}>Save the listing first to upload or generate photos.</span>}
      </div>

      {/* ── Gallery: everything in one strip, cover star on top ── */}
      {images.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Gallery ({images.length}) — ⭐ = cover
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {images.map((u) => {
              const isCover = u === cover
              return (
                <div key={u} style={{ borderRadius: 8, overflow: 'hidden', border: isCover ? '2px solid #b45309' : '1px solid var(--line)', background: '#fff', position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="gallery" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                  {isCover && (
                    <span style={{ position: 'absolute', top: 4, left: 4, background: '#b45309', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 99 }}>
                      ⭐ Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setCover(u)}
                    disabled={isCover || coverBusy === u}
                    title="Make this the cover/primary photo"
                    style={{
                      width: '100%', padding: '4px 0', border: 'none', fontSize: 10.5, fontWeight: 700, cursor: isCover ? 'default' : 'pointer',
                      background: isCover ? '#fdf3e3' : '#f1f5f9', color: isCover ? '#b45309' : '#475569',
                    }}
                  >
                    {coverBusy === u ? '…' : isCover ? '⭐ Cover' : '☆ Set cover'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Two paths side by side ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {/* Path 1: Upload your own */}
        <div style={{ border: '1px dashed #cbb8f0', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>📤 Upload your own</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 }}>
            Real photos of the business — interior, exterior, equipment. JPG / PNG / WebP / HEIC, up to 10MB each.
          </div>
          <label
            style={{
              display: 'block', textAlign: 'center', padding: '14px 10px', borderRadius: 8, cursor: hasListing && !uploading ? 'pointer' : 'not-allowed',
              background: '#f8f4ff', border: '1px dashed #a78bfa', fontSize: 12.5, fontWeight: 700, color: '#4c1d95',
              opacity: hasListing && !uploading ? 1 : 0.5,
            }}
          >
            {uploading ? '⏳ Uploading…' : '+ Choose photos'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              hidden
              disabled={!hasListing || uploading}
              onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }}
            />
          </label>
        </div>

        {/* Path 2: Generate options */}
        <div style={{ border: '1px dashed #cbb8f0', borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 6 }}>✨ Generate options</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 }}>
            Claude writes a photo prompt from your listing details, then the AI renders 4 options.
            {promptSource && <span style={{ display: 'block', marginTop: 3, fontWeight: 700, color: '#4c1d95' }}>🧠 {promptSource}</span>}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {AI_PHOTO_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyleId(s.id)}
                style={{
                  padding: '3px 9px', borderRadius: 999, border: '1px solid #cbb8f0', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: styleId === s.id ? '#4c1d95' : '#fff', color: styleId === s.id ? '#fff' : '#4c1d95',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={generating || !hasListing}
            style={{
              width: '100%', padding: '9px', borderRadius: 8, border: 'none', cursor: generating || !hasListing ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg,#4c1d95,#2563eb)', color: '#fff', fontSize: 12.5, fontWeight: 800,
              opacity: generating || !hasListing ? 0.6 : 1,
            }}
          >
            {generating ? '🎨 Writing prompt + rendering 4…' : '🎨 Generate 4 photo options'}
          </button>
          {providerLabel && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>⚡ Generated with {providerLabel}</div>
          )}
        </div>
      </div>

      {/* ── Generated options grid (with save-to-gallery) ── */}
      {(generating || options.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginTop: 14 }}>
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
                    {committing === o.url ? 'Saving…' : added.has(o.url) ? '✓ In gallery' : '➕ Save to gallery'}
                  </button>
                </div>
              ))}
        </div>
      )}
      <style>{`@keyframes aiShimmer { to { background-position: -200% 0 } }`}</style>
    </div>
  )
}
