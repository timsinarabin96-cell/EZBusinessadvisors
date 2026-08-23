'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { PublicMarketplaceListing } from '@/lib/marketplace'
import { fmt$ } from '@/lib/recast'

export default function PublicListingCard({ listing }: { listing: PublicMarketplaceListing }) {
  const image = listing.gallery_urls[0]
  const href = `/marketplace/listings/${listing.slug || listing.id}`
  const isNew = listing.published_at ? Date.now() - new Date(listing.published_at).getTime() < 7 * 86400000 : false

  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(26,26,46,0.06)' }}>
      <div style={{ height: 180, background: '#1a1a2e', position: 'relative', overflow: 'hidden' }}>
        {image ? (
          <Image src={image} alt={listing.public_title} fill sizes="(max-width: 768px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(201,168,76,0.5)', fontSize: 40 }}>🏢</div>
        )}
        <span style={{ position: 'absolute', top: 12, left: 12, background: 'rgba(26,26,46,0.85)', color: '#c9a84c', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          {listing.industry || 'Business'}
        </span>
        {listing.is_confidential && (
          <span style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(255,255,255,0.92)', color: '#1a1a2e', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
            Confidential
          </span>
        )}
        {listing.is_featured && (
          <span style={{ position: 'absolute', bottom: 12, left: 12, background: 'linear-gradient(135deg,#c9a84c,#a8872f)', color: '#1a1a2e', padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
            ★ Featured
          </span>
        )}
        {isNew && (
          <span style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(16,42,67,0.92)', color: '#fff', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
            NEW
          </span>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {listing.seller_financing_available && <BadgeTone color="#0e7490">💰 Financing</BadgeTone>}
          {listing.is_absentee_owner && <BadgeTone color="#15803d">🏖️ Absentee</BadgeTone>}
          {listing.is_franchise && <BadgeTone color="#7c3aed">🏷️ Franchise</BadgeTone>}
          {listing.is_relocatable && <BadgeTone color="#b45309">📦 Relocatable</BadgeTone>}
          {listing.employees_full_time != null && <BadgeTone color="#64748b">{listing.employees_full_time} FT</BadgeTone>}
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e', fontFamily: 'Georgia, serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {listing.public_title}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{listing.location_general || 'Location confidential'}</div>
        {listing.public_summary && (
          <div style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {listing.public_summary}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Asking Price</div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#c9a84c', fontFamily: 'Georgia, serif' }}>
              {listing.asking_price !== null ? fmt$(listing.asking_price) : 'Upon Request'}
            </div>
          </div>
          {listing.annual_revenue !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Revenue</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{fmt$(listing.annual_revenue)}</div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function BadgeTone({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ background: `${color}14`, color, border: `1px solid ${color}33`, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>
      {children}
    </span>
  )
}
