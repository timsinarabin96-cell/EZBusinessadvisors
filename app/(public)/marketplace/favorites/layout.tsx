import type { Metadata } from 'next'

// Route-level metadata for /marketplace/favorites (client-component page).
// User-specific saved listings — keep out of search results.
export const metadata: Metadata = {
  title: 'Saved Businesses — Your Favorites | Concord Deal Platform',
  description: 'Your saved businesses for sale — revisit, compare, and shortlist your favorite acquisition opportunities.',
  alternates: { canonical: '/marketplace/favorites' },
  robots: { index: false, follow: false },
}

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
