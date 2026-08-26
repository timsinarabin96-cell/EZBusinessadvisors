/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { affiliateLinksFor } from '@/lib/affiliates'

// =============================================================================
// AffiliateResources — "Resources we recommend" section for guides, financing,
// and footer surfaces. Renders only the affiliate links tagged for that
// surface. FTC-friendly: labeled as recommendations, links are nofollow.
// =============================================================================

export default function AffiliateResources({ surface, title = 'Resources We Recommend' }: { surface: 'guides' | 'financing' | 'footer'; title?: string }) {
  const links = affiliateLinksFor(surface)
  if (links.length === 0) return null

  return (
    <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 14, padding: '26px 28px', marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>🛠️</span>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 19, color: '#1a1a2e', margin: 0 }}>{title}</h2>
        <span style={{ flex: 1, height: 1, background: '#ece8dc' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {links.map((l) => (
          <a
            key={l.name}
            href={l.href}
            target="_blank"
            rel="nofollow sponsored noopener"
            style={{ textDecoration: 'none', display: 'block', background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '16px 18px', transition: 'border-color .15s ease, box-shadow .15s ease' }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>{l.name}</div>
            <div style={{ fontSize: 12.5, color: '#666', lineHeight: 1.55, marginTop: 6 }}>{l.tagline}</div>
            <div style={{ fontSize: 12, color: '#c9a84c', fontWeight: 800, marginTop: 10 }}>Learn more →</div>
          </a>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 14 }}>
        Some links are affiliate links — we may earn a commission at no extra cost to you.
      </div>
    </div>
  )
}
