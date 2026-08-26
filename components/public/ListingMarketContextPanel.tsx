/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { MarketContext } from '@/lib/listingMarketContextCore'

// =============================================================================
// ListingMarketContextPanel — buyer-facing "market context" block on the
// public listing page. Shows the typical sale multiple for the industry,
// where this asking price sits relative to the band, comparable-deal stats,
// and a "why this listing" teaser. Pure presentational; server-rendered.
// =============================================================================

const money = (n: number | null | undefined): string =>
  n == null ? '—' : '$' + Math.round(n).toLocaleString()

export default function ListingMarketContextPanel({ ctx }: { ctx: MarketContext }) {
  const pos = ctx.position

  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>📈</span>
        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>
          Market Context
        </div>
      </div>

      {ctx.band && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
          <div style={{ flex: '1 1 200px', background: 'linear-gradient(135deg, #1a1a2e, #2b2b4a)', borderRadius: 10, padding: '14px 16px', color: '#fff' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
              Typical sale multiple
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', marginTop: 4 }}>
              {ctx.band.min.toFixed(1)}–{ctx.band.max.toFixed(1)}× {ctx.band.basis}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{ctx.band.industry} businesses</div>
          </div>

          {pos && pos.multiple != null && (
            <div style={{ flex: '1 1 200px', background: pos.position === 'above' ? '#fdf3e3' : pos.position === 'below' ? '#e8f7ee' : '#f0ecdf', border: `1px solid ${pos.position === 'above' ? '#f0dfc0' : pos.position === 'below' ? '#c6e9d3' : '#ddd6c4'}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>
                Asking price position
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a1a2e', marginTop: 4 }}>
                {pos.multiple.toFixed(1)}× {pos.basis}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {pos.position === 'within' ? 'within the typical range' : pos.position === 'below' ? 'below the typical range' : 'above the typical range'}
              </div>
            </div>
          )}

          {ctx.comp && ctx.comp.count > 0 && (
            <div style={{ flex: '1 1 200px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>
                Comparable deals
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a1a2e', marginTop: 4 }}>
                {ctx.comp.count}
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {ctx.comp.medianSalePrice != null ? `median ${money(ctx.comp.medianSalePrice)}` : 'tracked'}
                {ctx.comp.avgDaysToSell != null ? ` · ~${ctx.comp.avgDaysToSell}d to sell` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {ctx.teaser && (
        <div style={{ marginTop: 14, fontSize: 13.5, color: '#555', lineHeight: 1.6, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          “{ctx.teaser}”
        </div>
      )}

      {ctx.bullets.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: '#666', lineHeight: 1.7 }}>
          {ctx.bullets.map((b) => (
            <li key={b} style={{ marginTop: 3 }}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
