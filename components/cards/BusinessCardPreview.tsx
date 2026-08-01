'use client'

// ---------------------------------------------------------------------------
// BusinessCardPreview — live preview of a broker's business card using the
// effective brand (colors, font, logo, layout). Re-renders in real time as
// the brand settings change. Pure presentational — no data fetching.
// ---------------------------------------------------------------------------

import type { CardBrand } from '@/lib/branding'
import { fontCss } from '@/lib/branding'

export interface CardOwnerInfo {
  name: string
  title: string
  company?: string
  phone?: string
  email?: string
  website?: string
}

export default function BusinessCardPreview({
  brand,
  owner,
  front = true,
}: {
  brand: CardBrand
  owner: CardOwnerInfo
  front?: boolean
}) {
  const { primaryColor, secondaryColor, accentColor, font, logoUrl, layout } = brand
  const ff = fontCss(font)

  const cardStyle: React.CSSProperties = {
    width: 340,
    height: 204,
    borderRadius: 12,
    overflow: 'hidden',
    background: front ? primaryColor : secondaryColor,
    color: '#fff',
    fontFamily: ff,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 28px rgba(26,26,46,0.22)',
    border: `1px solid ${adjust(primaryColor, -16)}`,
  }

  return (
    <div style={cardStyle}>
      {/* accent rule */}
      <div
        style={{
          height: 6,
          background: `linear-gradient(90deg, ${accentColor}, ${adjust(accentColor, 20)})`,
          flexShrink: 0,
        }}
      />

      {/* body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 20px' }}>
        {front ? (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {owner.name || 'Your Name'}
                </div>
                <div style={{ fontSize: 12, color: accentColor, fontWeight: 600, marginTop: 2 }}>
                  {owner.title || 'Business Broker'}
                </div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>
                  {owner.company || 'Concord Deal Platform'}
                </div>
              </div>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0, borderRadius: 6, background: 'rgba(255,255,255,0.12)' }} />
              ) : (
                <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 6, background: accentColor, color: primaryColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>
                  {(owner.company || 'C').slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{ marginTop: 'auto', fontSize: 11, opacity: 0.85, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {owner.phone && <span>📞 {owner.phone}</span>}
              {owner.email && <span>✉️ {owner.email}</span>}
              {owner.website && <span>🌐 {owner.website}</span>}
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
            {layout === 'modern' || layout === 'split' ? (
              <>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: accentColor }}>
                  {owner.company || 'CONCORD'}
                </div>
                <div style={{ fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.7 }}>
                  Business Brokerage
                </div>
              </>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
                {owner.name || 'Your Name'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Lighten/darken a #rrggbb color by a signed amount (-255..255). */
function adjust(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex
  const n = parseInt(h, 16)
  const r = clamp(((n >> 16) & 255) + amt)
  const g = clamp(((n >> 8) & 255) + amt)
  const b = clamp((n & 255) + amt)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
function clamp(v: number): number {
  return Math.max(0, Math.min(255, v))
}
