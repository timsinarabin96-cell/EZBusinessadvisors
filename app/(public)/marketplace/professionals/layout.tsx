import type { Metadata } from 'next'

// Route-level metadata for /marketplace/professionals (client-component page).
export const metadata: Metadata = {
  title: 'Deal Professionals — Attorneys, CPAs, Lenders | Concord Deal Platform',
  description: 'A trusted network of business attorneys, CPAs, lenders, and consultants who help buyers and sellers close deals smoothly.',
  alternates: { canonical: '/marketplace/professionals' },
  openGraph: {
    title: 'Deal Professionals — Concord Deal Platform',
    description: 'Attorneys, CPAs, lenders, and consultants ready to help close your deal.',
    url: '/marketplace/professionals',
    type: 'website',
  },
}

export default function ProfessionalsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
