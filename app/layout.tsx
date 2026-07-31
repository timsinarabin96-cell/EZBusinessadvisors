import type { Metadata } from 'next'
import './globals.css'
import LegalFooter from '@/components/public/LegalFooter'

export const metadata: Metadata = {
  title: 'Concord Deal Platform',
  description: 'Business Brokerage Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--paper)',
        }}
      >
        <main style={{ flex: '1 1 auto' }}>{children}</main>
        <LegalFooter />
      </body>
    </html>
  )
}
