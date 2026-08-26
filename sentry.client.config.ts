/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  // 10% of transactions for cost-conscious observability; errors always captured.
  tracesSampleRate: 0.1,
  debug: false,
  // No-ops gracefully when SENTRY_DSN is unset (local dev / pre-config).
})
