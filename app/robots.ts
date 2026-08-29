/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://ezbusinessadvisors.vercel.app'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/marketplace', '/marketplace/listings'],
        disallow: [
          '/portal/',           // token-gated client portals
          '/api/',              // API endpoints
          '/dashboard/',        // broker-only
          '/admin/',            // platform admin
          '/pipeline', '/leads', '/listings', '/documents', '/recast',
          '/cim', '/bov', '/due-diligence', '/agencies', '/billing',
          '/sync', '/share/',   // token-gated CIM shares (unless listed)
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
