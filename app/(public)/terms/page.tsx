/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms & Risk Disclosure — Concord Deal Platform',
  description: 'Terms of service and risk disclosure for sellers, buyers, and professionals on the Concord Deal Platform.',
}

export default function TermsPage() {
  return (
    <div style={{ background: '#faf9f4', minHeight: '100vh' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '64px 24px 96px' }}>
        <div style={{ color: '#c9a84c', fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>Legal</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 38, color: '#1a1a2e', margin: '10px 0 8px' }}>Terms &amp; Risk Disclosure</h1>
        <p style={{ color: '#888', fontSize: 13.5 }}>Effective: August 2026 · Concord Deal Platform (EZ Business Advisors LLC)</p>

        <Section title="1. The platform is a venue, not a broker">
          <p>
            Concord Deal Platform provides technology and a marketplace venue. It is <strong>not a licensed business broker</strong> and does
            not act as an agent, fiduciary, or advisor for any seller or buyer. Listings are published by the parties themselves and are
            provided <strong>“as is”</strong>, without representation or warranty of accuracy, completeness, legality, or value.
          </p>
        </Section>

        <Section title="2. Seller attestation — listing at your own risk">
          <p>
            By submitting a listing, the seller attests that they <strong>own the business or are expressly authorized</strong> to sell it,
            that the information provided is true and complete to the best of their knowledge, and that they understand the listing is
            published <strong>at their own risk</strong>. Concord Deal Platform strongly recommends that sellers engage a{' '}
            <strong>licensed business broker</strong> and qualified legal, tax, and accounting advisors before selling.
          </p>
        </Section>

        <Section title="3. Verification and identity">
          <p>
            Sellers are required to verify their identity (email confirmation, phone verification, and a profile photo) before a listing
            can go live. This helps deter fraud, but Concord Deal Platform cannot guarantee the identity, intentions, or financial condition
            of any party. Buyers and sellers are responsible for performing their own due diligence.
          </p>
        </Section>

        <Section title="4. No liability for transactions">
          <p>
            Concord Deal Platform is not a party to any transaction between sellers and buyers. To the maximum extent permitted by law,
            Concord Deal Platform, its owners, and affiliates are <strong>not liable</strong> for any loss, claim, damage, or dispute arising
            from or relating to any listing, inquiry, negotiation, or transaction conducted through the platform — including fraud,
            misrepresentation, breach of contract, or regulatory non-compliance by any user.
          </p>
        </Section>

        <Section title="5. Buyer responsibility">
          <p>
            Buyers acknowledge that all information comes from sellers and must be independently verified: financial statements, tax
            returns, legal standing, liens, leases, and all other representations. Buyers should engage their own broker, attorney, and
            accountant. Nothing on this platform is an offer or solicitation requiring licensure.
          </p>
        </Section>

        <Section title="6. Prohibited content and conduct">
          <p>
            No illegal, fraudulent, misleading, or unlicensed activity is permitted. Concord Deal Platform may remove any listing, suspend
            any account, or refuse service at any time, and may cooperate with law enforcement. Users agree to indemnify and hold harmless
            Concord Deal Platform and EZ Business Advisors LLC from all claims arising out of their use of the platform.
          </p>
        </Section>

        <Section title="8. Franchise Listings">
          <p>
            Franchise Opportunity listings are an <strong>advertising surface only</strong>. The Platform does not sell franchises, does
            not act as a franchisor or franchise broker, and does not review, verify, or warrant any Franchise Disclosure
            Document (FDD), Item 19 financial performance representation, or other franchise materials. The franchisor is solely
            responsible for their own FDD and for compliance with the FTC&apos;s Franchise Rule and all applicable state
            franchise-disclosure and registration laws. Franchise listings are offered on a paid monthly basis and may be removed
            at the end of the paid period.
          </p>
        </Section>

        <Section title="9. Real Property Conveyance on Combined Listings">
          <p>
            Where a listing includes real estate, the real property portion of any transaction is handled exclusively by an
            <strong> independently licensed real estate professional</strong> (licensed agent or real estate attorney). Neither Concord Deal
            Platform nor Rabin Timsina personally closes real property transactions, and neither provides real estate brokerage
            services. The business purchase agreement and the real estate purchase agreement are <strong>two separate legal documents</strong>
            and are never blended into a single contract.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions: <a href="mailto:info@ezbusinessadvisors.com" style={{ color: '#c9a84c' }}>info@ezbusinessadvisors.com</a>
          </p>
        </Section>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <Link href="/" style={{ color: '#c9a84c', fontWeight: 700, fontFamily: 'Georgia, serif', textDecoration: 'none' }}>← Back to home</Link>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a2e', margin: '0 0 10px' }}>{title}</h2>
      <div style={{ fontSize: 14.5, color: '#555', lineHeight: 1.75 }}>{children}</div>
    </div>
  )
}
