import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPublicFeed, type PublicMarketplaceListing } from '@/lib/marketplace'
import PublicListingCard from '@/components/public/PublicListingCard'

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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
  )
}
