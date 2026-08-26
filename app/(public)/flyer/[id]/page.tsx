import { fetchPublicListing } from '@/lib/marketplace'
import { fmt$ } from '@/lib/recast'
import Link from 'next/link'
import AgentContactCard from '@/components/public/AgentContactCard'
import { fetchPublicListingMeta } from '@/lib/publicListingMeta'

export const dynamic = 'force-dynamic'

/**
 * /flyer/[id] — branded one-page listing flyer (print/download friendly).
 * Brokers share these on social/WhatsApp; buyers print them for review.
 * Confidential info (exact name/address) stays hidden.
 */
export default async function FlyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await fetchPublicListing(id)
  if (!listing) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f7f5ee' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>📄</div>
          <h1 style={{ fontFamily: 'Georgia, serif', color: '#1a1a2e' }}>Listing not found</h1>
          <Link href="/marketplace/listings" style={{ color: '#c9a84c', fontWeight: 700 }}>← Back to listings</Link>
        </div>
      </div>
    )
  }

  // Listing ID + assigned agent (server-side enrichment, same as detail page).
  const meta = await fetchPublicListingMeta(listing.slug || listing.id)

  const multiple = listing.sde && listing.asking_price ? (listing.asking_price / listing.sde).toFixed(2) : null

  return (
    <div style={{ background: '#e9e6da', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 60px rgba(16,42,67,0.15)' }}>
        {/* Header band */}
        <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', color: '#fff', padding: '28px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c9a84c', fontWeight: 700 }}>Concord · Business For Sale</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, margin: '6px 0 4px' }}>{listing.public_title}</h1>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.75)' }}>
              {[listing.industry, listing.sub_industry, listing.location_general].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#c9a84c' }}>Price on application</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Talk with an agent</div>
          </div>
        </div>

        {/* Image */}
        {listing.gallery_urls.length > 0 && (
          <div style={{ height: 300, background: '#1a1a2e' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.gallery_urls[0]} alt={listing.public_title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Summary */}
        <div style={{ padding: '26px 32px' }}>
          <p style={{ color: '#444', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 20px' }}>
            {listing.public_summary || 'A confidential, established business opportunity. Additional information available to qualified buyers.'}
          </p>

          {/* Financials */}
          {listing.show_financials && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
              <FlyerStat label="Annual Revenue" value={listing.annual_revenue !== null ? fmt$(listing.annual_revenue) : '—'} />
              <FlyerStat label="SDE" value={listing.sde !== null ? fmt$(listing.sde) : '—'} />
              {listing.ebitda !== null && <FlyerStat label="EBITDA" value={fmt$(listing.ebitda)} />}
              {multiple && <FlyerStat label="Asking / SDE" value={`${multiple}×`} />}
            </div>
          )}

          {/* Key facts */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {listing.established_year != null && <Chip>📅 Est. {listing.established_year}</Chip>}
            {listing.employees_full_time != null && <Chip>👥 {listing.employees_full_time} FT</Chip>}
            {listing.is_absentee_owner != null && <Chip>{listing.is_absentee_owner ? '🏖️ Absentee' : '👤 Owner-operated'}</Chip>}
            {listing.sba_qualified != null && <Chip>{listing.sba_qualified ? '🏦 SBA Qualified' : 'Not SBA'}</Chip>}
            {listing.seller_financing_available != null && <Chip>{listing.seller_financing_available ? '💰 Seller financing' : 'Financing not offered'}</Chip>}
            {listing.is_franchise != null && <Chip>{listing.is_franchise ? '🏷️ Franchise' : 'Independent'}</Chip>}
            {listing.is_relocatable != null && <Chip>{listing.is_relocatable ? '📦 Relocatable' : 'Stays in place'}</Chip>}
          </div>

          {/* Highlights */}
          {listing.public_highlights.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 8 }}>Highlights</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#555', lineHeight: 1.8, fontSize: 14 }}>
                {listing.public_highlights.slice(0, 6).map((h) => <li key={h}>{h}</li>)}
              </ul>
            </div>
          )}

          {/* Listing ID + agent */}
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meta?.listingRef && (
              <div style={{ fontSize: 12, color: '#888' }}>
                <span style={{ background: '#f0ecdf', color: '#1a1a2e', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  🆔 {meta.listingRef}
                </span>
              </div>
            )}
            <AgentContactCard agent={meta?.agent || null} />
          </div>

          {/* Confidentiality note */}
          <div style={{ background: '#faf9f4', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px', fontSize: 12.5, color: '#888', lineHeight: 1.6 }}>
            🔒 Confidential information, exact location, and financial statements are released only through the approved buyer qualification process.
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#1a1a2e', color: '#fff', padding: '18px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>Concord Deal Platform · Concord Business Brokerage</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => window.print()}
              style={{ padding: '9px 18px', borderRadius: 8, background: '#c9a84c', color: '#1a1a2e', border: 'none', fontWeight: 800, cursor: 'pointer', fontFamily: 'Georgia, serif' }}
            >
              🖨️ Print / Save PDF
            </button>
            <Link href={`/marketplace/listings/${listing.slug}`} style={{ padding: '9px 18px', borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontFamily: 'Georgia, serif' }}>
              View listing →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlyerStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8f6ef', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', marginTop: 3 }}>{value}</div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ padding: '7px 13px', borderRadius: 99, background: '#faf9f4', border: '1px solid #ece8dc', fontSize: 12.5, fontWeight: 700, color: '#1a1a2e' }}>{children}</span>
}
