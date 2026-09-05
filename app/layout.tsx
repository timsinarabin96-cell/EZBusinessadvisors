/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import LegalFooter from '@/components/public/LegalFooter'
import ServiceWorkerRegister from '@/components/pwa/ServiceWorkerRegister'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

// Self-hosted fonts (deep-pass fix): next/font downloads + serves the woff2
// at build time — kills the Firefox 'downloadable font' errors, removes the
// third-party Google Fonts request (privacy), and works offline after build.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })

const APP_NAME = 'Concord Deal Platform'
const APP_DESCRIPTION =
  'Business brokerage platform — listings, deal pipeline, client portals, and financial recasting.'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://concorddeal.com'),
  title: {
    default: `${APP_NAME} — Business Brokerage`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Concord',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    type: 'website',
    siteName: APP_NAME,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Concord Deal Platform — Buy or Sell a Business' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ['/og-default.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Concord" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="color-scheme" content="light" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--paper)',
        }}
      >
        <a href="#main-content" className="skip-link">Skip to content</a>
        <main id="main-content" style={{ flex: '1 1 auto' }}>{children}</main>
        <LegalFooter />
        <ServiceWorkerRegister />
        {/* Vercel Analytics + Speed Insights — traffic, Web Vitals, and UX metrics. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
