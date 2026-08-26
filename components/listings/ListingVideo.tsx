/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// ListingVideo — embeds a walkthrough/promo video on a listing.
// Supports YouTube, Vimeo, and direct .mp4/.webm files. Safe: only the
// configured video providers are embeddable; anything else renders a link.
// =============================================================================

interface ListingVideoProps {
  url: string | null | undefined
  title?: string | null
  style?: React.CSSProperties
}

function parseYouTube(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

function parseVimeo(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/)
  return m ? `https://player.vimeo.com/video/${m[1]}` : null
}

function isDirectFile(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(url)
}

export default function ListingVideo({ url, title, style }: ListingVideoProps) {
  if (!url || !url.trim()) return null
  const trimmed = url.trim()

  const youtube = parseYouTube(trimmed)
  if (youtube) {
    return (
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: '#000', aspectRatio: '16/9', ...(style || {}) }}>
        <iframe
          src={youtube}
          title={title || 'Listing walkthrough video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    )
  }

  const vimeo = parseVimeo(trimmed)
  if (vimeo) {
    return (
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: '#000', aspectRatio: '16/9', ...(style || {}) }}>
        <iframe
          src={vimeo}
          title={title || 'Listing walkthrough video'}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
      </div>
    )
  }

  if (isDirectFile(trimmed)) {
    return (
      <video
        controls
        preload="metadata"
        title={title || 'Listing walkthrough video'}
        style={{ width: '100%', borderRadius: 12, border: '1px solid var(--line)', background: '#000', aspectRatio: '16/9', ...(style || {}) }}
      >
        <source src={trimmed} />
        Your browser does not support embedded video.
      </video>
    )
  }

  return (
    <a href={trimmed} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: '#f1f5f9', color: '#0f172a', fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
      ▶️ Watch walkthrough video
    </a>
  )
}
