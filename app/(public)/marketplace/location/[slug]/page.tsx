import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPublicFeed, type PublicMarketplaceListing } from '@/lib/marketplace'
import PublicListingCard from '@/components/public/PublicListingCard'
import SoldCompsTicker from '@/components/public/SoldCompsTicker'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const STATE_MAP: Record<string, string> = {
  'california': 'CA', 'texas': 'TX', 'florida': 'FL', 'new-york': 'NY', 'pennsylvania': 'PA',
  'illinois': 'IL', 'ohio': 'OH', 'georgia': 'GA', 'north-carolina': 'NC', 'michigan': 'MI',
  'new-jersey': 'NJ', 'virginia': 'VA', 'washington': 'WA', 'arizona': 'AZ', 'massachusetts': 'MA',
  'tennessee': 'TN', 'indiana': 'IN', 'missouri': 'MO', 'maryland': 'MD', 'wisconsin': 'WI',
  'colorado': 'CO', 'minnesota': 'MN', 'south-carolina': 'SC', 'alabama': 'AL', 'louisiana': 'LA',
  'kentucky': 'KY', 'oregon': 'OR', 'oklahoma': 'OK', 'connecticut': 'CT', 'utah': 'UT',
  'iowa': 'IA', 'nevada': 'NV', 'arkansas': 'AR', 'mississippi': 'MS', 'kansas': 'KS',
  'new-mexico': 'NM', 'nebraska': 'NE', 'west-virginia': 'WV', 'idaho': 'ID', 'hawaii': 'HI',
  'new-hampshire': 'NH', 'maine': 'ME', 'montana': 'MT', 'rhode-island': 'RI', 'delaware': 'DE',
  'south-dakota': 'SD', 'north-dakota': 'ND', 'alaska': 'AK', 'vermont': 'VT', 'wyoming': 'WY',
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function generateStaticParams() {
  const all = await fetchPublicFeed()
  const states = new Set<string>()
  for (const l of all) {
    const loc = (l.location_general || '').toLowerCase()
    for (const [slug, abbrev] of Object.entries(STATE_MAP)) {
      if (loc.includes(abbrev.toLowerCase()) || loc.includes(slug.replace(/-/g, ' '))) states.add(slug)
    }
  }
  return Array.from(states).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const label = titleCase(params.slug)
  const title = `Businesses for Sale in ${label}`
  const description = `Browse businesses for sale in ${label}. Vetted, profitable opportunities with confidential financials available to qualified buyers.`
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/marketplace/location/${params.slug}` },
    openGraph: { title, description, type: 'website', url: `${BASE}/marketplace/location/${params.slug}` },
  }
}

export default async function LocationPage({ params }: { params: { slug: string } }) {
  const label = titleCase(params.slug)
  const abbrev = STATE_MAP[params.slug]
  const all = await fetchPublicFeed()

  const matches = all.filter((l) => {
    const loc = (l.location_general || '').toLowerCase()
    if (!loc) return false
    if (abbrev && loc.includes(abbrev.toLowerCase())) return true
    return loc.includes(label.toLowerCase())
  })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Businesses for Sale in ${label}`,
    description: `Browse businesses for sale in ${label}.`,
    url: `${BASE}/marketplace/location/${params.slug}`,
  }

  // Live market stats from the matching feed (never names, just aggregate signals).
  const priced = matches.filter((l) => l.asking_price != null) as (PublicMarketplaceListing & { asking_price: number })[]
  const avgAsking = priced.length ? Math.round(priced.reduce((s, l) => s + l.asking_price, 0) / priced.length) : null
  const minAsking = priced.length ? Math.min(...priced.map((l) => l.asking_price)) : null
  const maxAsking = priced.length ? Math.max(...priced.map((l) => l.asking_price)) : null
  const industriesHere = new Set(matches.map((l) => l.industry).filter(Boolean)).size
  const fmtNum = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How much does a business in ${label} cost?`,
        acceptedAnswer: { '@type': 'Answer', text: avgAsking ? `Listings currently range from ${fmtNum(minAsking!)} to ${fmtNum(maxAsking!)}, with an average asking price of ${fmtNum(avgAsking)}. Prices vary by industry, revenue, and earnings.` : 'Asking prices vary by industry, revenue, and earnings. Request access to see detailed financials.' },
      },
      {
        '@type': 'Question',
        name: `How do I buy a business in ${label}?`,
        acceptedAnswer: { '@type': 'Answer', text: 'Shortlist listings, get pre-qualified with an SBA lender, and sign an NDA to unlock full financials. Our certified intermediaries guide you through diligence and closing.' },
      },
      {
        '@type': 'Question',
        name: `How do I sell my business in ${label}?`,
        acceptedAnswer: { '@type': 'Answer', text: 'Request a free, confidential valuation. We recast your financials, market confidentially to qualified buyers, and manage the deal to closing.' },
      },
    ],
  }

  return (
    <>
      <SoldCompsTicker limit={6} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <nav style={{ fontSize: 13, color: '#888', marginBottom: 16, fontFamily: 'Georgia, serif' }}>
        <Link href="/" style={{ color: '#888', textDecoration: 'none' }}>Home</Link> <span>›</span>{' '}
        <Link href="/marketplace/listings" style={{ color: '#888', textDecoration: 'none' }}>Businesses for Sale</Link> <span>›</span>{' '}
        <span style={{ color: '#1a1a2e', fontWeight: 700 }}>{label}</span>
      </nav>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>Businesses for Sale in {label}</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>{matches.length} available{abbrev ? ` · ${abbrev}` : ''}</p>
        </div>
        <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none' }}>
          Browse all →
        </Link>
      </div>

      {/* Live market stats band */}
      {matches.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Avg asking</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginTop: 4 }}>{avgAsking ? fmtNum(avgAsking) : '—'}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Price range</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginTop: 4 }}>{minAsking != null ? `${fmtNum(minAsking)}–${fmtNum(maxAsking!)}` : '—'}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Active listings</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginTop: 4 }}>{matches.length}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Industries</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif', marginTop: 4 }}>{industriesHere}</div>
          </div>
        </div>
      )}

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No {label} listings right now</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Check back soon or{' '}
            <Link href="/contact" style={{ color: '#c9a84c', fontWeight: 700 }}>contact a broker</Link> for off-market opportunities.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {matches.map((l) => (
            <PublicListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
      </div>
    </>
  )
}
