/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'

export const runtime = 'edge'
export const alt = 'Business for sale'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// =============================================================================
// /api/listing-images/placeholder?title=…&industry=…&price=…&agency=…
// Auto-generated branded listing image — used when a listing has no gallery
// photos yet (cards + detail pages). Renders the industry, title, price, and
// a branded gradient with a big industry initial. Deterministic per query —
// CDN-cacheable, zero storage cost.
// =============================================================================

const INDUSTRY_EMOJI: Record<string, string> = {
  restaurant: '🍽️', food: '🍽️', cafe: '☕', retail: '🛍️', manufacturing: '🏭',
  construction: '🏗️', healthcare: '🏥', 'home care': '🏠', 'homecare': '🏠',
  transportation: '🚚', logistics: '📦', automotive: '🚗', 'auto repair': '🔧',
  technology: '💻', software: '💻', 'e-commerce': '🛒', 'digital marketing': '📈',
  'cleaning': '🧹', 'laundromat': '🧺', salon: '💇', 'beauty': '💇',
  gym: '🏋️', fitness: '🏋️', daycare: '🧸', education: '🎓', 'tutoring': '📚',
  pharmacy: '💊', dental: '🦷', 'medical': '🩺', realestate: '🏢',
  'real estate': '🏢', accounting: '🧮', 'legal': '⚖️', 'insurance': '🛡️',
  landscaping: '🌿', 'pet': '🐾', 'veterinary': '🐾', 'storage': '📦',
  wholesale: '📊', distribution: '📊', agriculture: '🌾', 'gas station': '⛽',
  'convenience': '🏪', 'franchise': '🏷️', hotel: '🏨', 'motel': '🏨',
}

const PLACEHOLDER_BG = 'linear-gradient(135deg, #0f2038 0%, #153e5c 55%, #1a5a7a 100%)'
const GOLD = '#c9a84c'

function industryEmoji(industry: string | null | undefined): string {
  const key = (industry || '').toLowerCase().trim()
  if (!key) return '🏢'
  // exact hit first, then partial match
  if (INDUSTRY_EMOJI[key]) return INDUSTRY_EMOJI[key]
  for (const [k, emoji] of Object.entries(INDUSTRY_EMOJI)) {
    if (key.includes(k)) return emoji
  }
  return '🏢'
}

function money(n: string | null | undefined): string {
  if (!n) return ''
  const v = Number(n)
  if (!v) return ''
  return '$' + Math.round(v).toLocaleString()
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const title = String(sp.get('title') || 'Business Opportunity').slice(0, 90)
  const industry = String(sp.get('industry') || '').slice(0, 40)
  const price = money(sp.get('price'))
  const agency = String(sp.get('agency') || '').slice(0, 40)
  const initial = (industry || title || 'B').trim().charAt(0).toUpperCase()

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: PLACEHOLDER_BG, color: '#fff', fontFamily: 'Georgia, serif', position: 'relative' }}>
        {/* subtle diagonal accent */}
        <div style={{ position: 'absolute', right: -120, top: -120, width: 420, height: 420, borderRadius: '50%', background: 'rgba(201,168,76,0.14)' }} />
        <div style={{ position: 'absolute', right: -40, bottom: -160, width: 380, height: 380, borderRadius: '50%', background: 'rgba(118,215,234,0.10)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(255,255,255,0.10)', border: `1px solid ${GOLD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34 }}>
              {industryEmoji(industry)}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.12em', color: GOLD, textTransform: 'uppercase' }}>
              {industry || 'Business Opportunity'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 52, fontWeight: 700, lineHeight: 1.15, maxWidth: 900 }}>{title}</div>
            {price && <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, marginTop: 18 }}>{price}</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)' }}>Confidential business acquisition opportunity</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{initial}</div>
              <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{agency || 'Concord Deal Platform'}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
