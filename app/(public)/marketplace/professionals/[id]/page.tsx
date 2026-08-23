import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchPublicProfessional, PROFESSIONAL_LABELS } from '@/lib/professionals'
import { createServerClient } from '@/lib/supabase/server'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://concord.ezbusinessadvisors.com'

async function getProfessional(id: string) {
  const client = createServerClient()
  if (!client) return null
  const { data } = await client
    .from('deal_professionals')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const pro = await getProfessional(params.id)
  if (!pro) return { title: 'Professional Not Found', robots: { index: false } }
  const label = PROFESSIONAL_LABELS[pro.professional_type as keyof typeof PROFESSIONAL_LABELS] || 'Deal Professional'
  return {
    title: `${pro.name} — ${label} | Concord Markets`,
    description: pro.bio?.slice(0, 155) || `${label} serving business buyers and sellers.`,
    alternates: { canonical: `${BASE}/marketplace/professionals/${pro.id}` },
  }
}

export default async function ProfessionalProfilePage({ params }: { params: { id: string } }) {
  const pro = await getProfessional(params.id)
  if (!pro) notFound()

  const label = PROFESSIONAL_LABELS[pro.professional_type as keyof typeof PROFESSIONAL_LABELS] || 'Deal Professional'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: pro.name,
    description: pro.bio || undefined,
    areaServed: pro.states_served?.length ? pro.states_served.join(', ') : (pro.country_code || 'US'),
    knowsAbout: pro.specialty || undefined,
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '56px 24px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Link href="/marketplace/professionals" style={{ color: '#0e7490', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>← All professionals</Link>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginTop: 28, flexWrap: 'wrap' }}>
        <div style={{ width: 110, height: 110, flex: '0 0 110px', borderRadius: 22, background: '#102a43', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, overflow: 'hidden' }}>
          {pro.avatar_url ? <img src={pro.avatar_url} alt={pro.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👔'}
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 34, color: '#102a43', margin: 0 }}>{pro.name}</h1>
            {pro.is_platform_verified && <span title="Platform verified" style={{ background: '#e6f6ec', color: '#1e7e34', fontSize: 12, fontWeight: 800, padding: '5px 10px', borderRadius: 999 }}>✅ Verified</span>}
          </div>
          <div style={{ fontSize: 16, color: '#0e7490', fontWeight: 800, marginTop: 6 }}>{label}{pro.firm ? ` · ${pro.firm}` : ''}</div>
          {pro.title && <div style={{ fontSize: 14, color: '#7b8794', marginTop: 3 }}>{pro.title}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {pro.specialty && <Tag>{pro.specialty}</Tag>}
            {(pro.industries || []).slice(0, 5).map((i: string) => <Tag key={i}>{i}</Tag>)}
            {(pro.states_served || []).length > 0 && <Tag>{pro.states_served.join(', ')}</Tag>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginTop: 32 }}>
        <Stat label="Experience" value={pro.years_experience ? `${pro.years_experience}+ years` : 'N/A'} />
        <Stat label="Deals closed" value={pro.deals_closed ? `${pro.deals_closed}+` : 'Confidential'} />
        <Stat label="License" value={pro.license_verified ? `Verified (${pro.license_state || 'US'})` : 'On file'} />
        <Stat label="Rates" value={pro.rates || 'Contact for rates'} />
      </div>

      {pro.bio && (
        <div style={{ background: '#fff', border: '1px solid #dce6ef', borderRadius: 16, padding: 28, marginTop: 28, boxShadow: '0 10px 35px rgba(16,42,67,0.06)' }}>
          <h2 style={{ fontSize: 15, color: '#102a43', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 14px' }}>About</h2>
          <p style={{ fontSize: 15, color: '#555', lineHeight: 1.75, margin: 0, whiteSpace: 'pre-wrap' }}>{pro.bio}</p>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #dce6ef', borderRadius: 16, padding: 28, marginTop: 20 }}>
        <h2 style={{ fontSize: 15, color: '#102a43', textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 14px' }}>Contact</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pro.email && <ContactLink href={`mailto:${pro.email}`}>✉️ {pro.email}</ContactLink>}
          {pro.phone && <ContactLink href={`tel:${pro.phone}`}>📞 {pro.phone}</ContactLink>}
          {pro.website && <ContactLink href={pro.website} external>🌐 {pro.website.replace(/^https?:\/\//, '')}</ContactLink>}
        </div>
        <p style={{ fontSize: 12, color: '#9aa5b1', marginTop: 18, lineHeight: 1.6 }}>
          Referred by a Concord partner broker. Credentials are listed as provided — always verify licensing and references directly before engaging.
        </p>
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ padding: '6px 11px', background: '#edf6fa', color: '#155e75', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{children}</span>
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={{ padding: 16, borderRadius: 12, background: '#f5f8fb', border: '1px solid #e3eef4' }}><div style={{ fontSize: 11, color: '#7b8794', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div><div style={{ fontSize: 16, color: '#102a43', fontWeight: 800, marginTop: 5 }}>{value}</div></div>
}

function ContactLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener' : undefined} style={{ color: '#102a43', textDecoration: 'none', fontSize: 14.5, fontWeight: 700 }}>{children}</a>
}
