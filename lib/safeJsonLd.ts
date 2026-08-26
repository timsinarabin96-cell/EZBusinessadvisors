/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// safeJsonLd — XSS-safe JSON-LD serialization for <script type="application/
// ld+json"> tags. JSON.stringify alone is NOT safe inside <script>: a value
// containing "</script>" terminates the element and lets attacker HTML/JS
// escape (OWASP: escape <, >, & and U+2028/U+2029). Applied to every public
// page that embeds structured data, including seller-supplied listing fields.
// =============================================================================

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}
