import type { Metadata } from 'next'

// Route-level metadata for /marketplace/qualify (client-component page).
export const metadata: Metadata = {
  title: 'Buyer Qualification — Get Matched with Businesses | Concord Deal Platform',
  description: 'Complete a quick buyer profile and get matched with vetted businesses that fit your budget, industry, and location. Confidential and free.',
  alternates: { canonical: '/marketplace/qualify' },
  openGraph: {
    title: 'Buyer Qualification — Concord Deal Platform',
    description: 'Tell us what you want and get matched with vetted businesses for sale.',
    url: '/marketplace/qualify',
    type: 'website',
  },
}

export default function QualifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
