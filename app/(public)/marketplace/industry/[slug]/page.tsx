import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchPublicFeed, fetchAllIndustries, type PublicMarketplaceListing } from '@/lib/marketplace'
import { buildSoldCompsReport } from '@/lib/soldComps'
import { getPublicAgencyContext } from '@/lib/publicAgency'
import { bandForIndustry } from '@/lib/marketMultiplesCore.ts'
import PublicListingCard from '@/components/public/PublicListingCard'
import SoldCompsTicker from '@/components/public/SoldCompsTicker'

export const dynamic = 'force-dynamic'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

const SLUG_TO_INDUSTRY: Record<string, string> = {
  'laundromats': 'Laundromat',
  'car-washes': 'Car Wash',
  'restaurants': 'Restaurant',
  'gas-stations': 'Gas Station',
  'convenience-stores': 'Convenience Store',
  'home-care': 'Home Care',
  'e-commerce': 'E-Commerce',
  'salons': 'Salon',
  'barbershops': 'Barbershop',
  'auto-repair': 'Auto Repair',
  'dental': 'Dental',
  'pharmacies': 'Pharmacy',
  'hotels': 'Hotel',
  'storage': 'Storage',
  'warehouses': 'Warehouse',
  'manufacturing': 'Manufacturing',
  'cleaning': 'Cleaning',
  'vending': 'Vending',
  'gyms': 'Gym',
  'daycares': 'Daycare',
  'pet-grooming': 'Pet Grooming',
  'liquor-stores': 'Liquor Store',
  'bakeries': 'Bakery',
  'coffee-shops': 'Coffee Shop',
  'trucking': 'Trucking',
  'plumbing': 'Plumbing',
  'hvac': 'HVAC',
  'print-shops': 'Printing',
  'landscaping': 'Landscaping',
  'janitorial': 'Janitorial',
  'veterinary': 'Veterinary',
  'funeral-homes': 'Funeral Home',
  'franchises': 'Franchise',
}

function slugify(industry: string): string {
  return industry.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function generateStaticParams() {
  const industries = await fetchAllIndustries()
  return industries.map((industry) => ({ slug: slugify(industry) }))
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const industry = SLUG_TO_INDUSTRY[params.slug] || params.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const title = `${industry} Businesses for Sale`
  const description = `Browse ${industry} businesses for sale. Vetted, profitable ${industry.toLowerCase()} opportunities with confidential financials available to qualified buyers.`
  return {
    title,
    description,
    alternates: { canonical: `${BASE}/marketplace/industry/${params.slug}` },
    openGraph: { title, description, type: 'website', url: `${BASE}/marketplace/industry/${params.slug}` },
  }
}

export default async function IndustryPage({ params }: { params: { slug: string } }) {
  const industry = SLUG_TO_INDUSTRY[params.slug] || params.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const agency = await getPublicAgencyContext()
  const [all, industries, compsReport] = await Promise.all([fetchPublicFeed(null, agency?.scope || null), fetchAllIndustries(agency?.scope || null), buildSoldCompsReport(agency?.scope || null)])

  const listings = all
    .filter((l) => l.industry?.toLowerCase() === industry.toLowerCase() || l.sub_industry?.toLowerCase() === industry.toLowerCase())
    .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))

  const prices = listings.map((l) => l.asking_price).filter((p): p is number => p !== null)
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

  // Live sold-comps for this industry — the SEO gold: real multiples + time-to-sell.
  const compStat = compsReport.industries.find(
    (s) => s.industry.toLowerCase() === industry.toLowerCase() || s.industry.toLowerCase().includes(industry.toLowerCase()),
  )

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${industry} Businesses for Sale`,
    description: `Browse ${industry} businesses for sale${compStat && compStat.avgMultiple ? ` — typical sale multiples ${compStat.avgMultiple.toFixed(1)}x SDE, median price $${Math.round(compStat.medianSalePrice || 0).toLocaleString()}` : ''}.`,
    url: `${BASE}/marketplace/industry/${params.slug}`,
  }

  return (
    <>
      <SoldCompsTicker limit={6} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px' }}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {compStat && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              { '@type': 'Question', name: `How much do ${industry} businesses sell for?`, acceptedAnswer: { '@type': 'Answer', text: `Based on recent sold transactions, ${industry} businesses in our market have sold at a median price of $${Math.round(compStat.medianSalePrice || 0).toLocaleString()}, with typical multiples around ${compStat.avgMultiple ? compStat.avgMultiple.toFixed(1) + 'x SDE' : 'market average'}.` } },
              { '@type': 'Question', name: `How long does it take to sell a ${industry} business?`, acceptedAnswer: { '@type': 'Answer', text: compStat.avgDaysToSell ? `On average, ${industry} businesses in our market have sold in about ${Math.round(compStat.avgDaysToSell)} days.` : 'Time-to-sell varies by price, financials, and buyer readiness.' } },
              { '@type': 'Question', name: `How do I buy a ${industry} business?`, acceptedAnswer: { '@type': 'Answer', text: 'Sign an NDA to access confidential financials, qualify with a broker, and work through a structured due-diligence and closing process.' } },
            ],
          }) }} />
        )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>Business Marketplace</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 34, color: '#1a1a2e', margin: '8px 0 0' }}>{industry} Businesses for Sale</h1>
          <p style={{ color: '#888', fontSize: 14, marginTop: 6 }}>
            {listings.length} available{avgPrice ? ` · avg asking ${'$' + avgPrice.toLocaleString()}` : ''}
          </p>
        </div>
        <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none' }}>
          Browse all →
        </Link>
      </div>

      {/* Live sold-comps market band — real multiples + time-to-sell */}
      {(() => {
        const band = bandForIndustry(industry, 'EBITDA')
        return band ? (
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #2b2b4a)', borderRadius: 12, padding: '18px 20px', color: '#fff' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>Typical sale multiple</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif', marginTop: 6 }}>{band.min.toFixed(1)}–{band.max.toFixed(1)}× {band.basis}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{band.industry} businesses usually sell</div>
          </div>
        ) : null
      })()}
      {compStat && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #2b2b4a)', borderRadius: 12, padding: '18px 20px', color: '#fff' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>Recent sales</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif', marginTop: 6 }}>{compStat.count}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{industry} businesses sold</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Avg multiple</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a1a2e', marginTop: 6 }}>{compStat.avgMultiple ? compStat.avgMultiple.toFixed(1) + 'x' : '—'}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>SDE multiple</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Median price</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a1a2e', marginTop: 6 }}>{compStat.medianSalePrice ? '$' + Math.round(compStat.medianSalePrice).toLocaleString() : '—'}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>per sold deal</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', fontWeight: 700 }}>Avg days to sell</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1a1a2e', marginTop: 6 }}>{compStat.avgDaysToSell ? Math.round(compStat.avgDaysToSell) : '—'}</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>listing to close</div>
          </div>
        </div>
      )}

      {/* Industry quick-nav */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        {industries.slice(0, 24).map((ind) => (
          <Link
            key={ind}
            href={`/marketplace/industry/${slugify(ind)}`}
            style={{ padding: '6px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: ind.toLowerCase() === industry.toLowerCase() ? '#1a1a2e' : '#fff', color: ind.toLowerCase() === industry.toLowerCase() ? '#c9a84c' : '#1a1a2e', border: '1px solid #ece8dc' }}
          >
            {ind}
          </Link>
        ))}
      </div>

      {listings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>No {industry} listings right now</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Check back soon or{' '}
            <Link href="/contact" style={{ color: '#c9a84c', fontWeight: 700 }}>contact a broker</Link> for off-market opportunities.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {listings.map((l) => (
            <PublicListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
      </div>
    </>
  )
}
