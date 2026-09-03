/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// QR code helpers for the business card contact flow.
//   generateVCard()      — plain vCard string (re-export of lib/vcard)
//   generateQRCode()     — renders a QR to SVG or PNG data-URL from vCard text
//   qrCodeToDataURL()    — convenience: returns a base64 data URL for preview
// Uses the `qrcode` package (already a dependency, ^1.5.4). The scan target is
// the broker's public /qr/<id> page, which offers one-click vCard save.
// =============================================================================

import QRCode from 'qrcode'
import { generateVCardString, type VCardContact } from '@/lib/vcard'

/** Style presets for the QR on the card back. */
export type QrStyle = 'classic' | 'rounded' | 'modern'

/** Re-export for callers that want the raw vCard text. */
export { generateVCardString as generateVCard } from '@/lib/vcard'

/** Resolve a dark/light color for a QR style. */
export function qrPalette(style: QrStyle): { dark: string; light: string } {
  switch (style) {
    case 'modern':
      return { dark: '#1a1a2e', light: '#ffffff' }
    case 'rounded':
      return { dark: '#16213e', light: '#f7f5ee' }
    default:
      return { dark: '#000000', light: '#ffffff' }
  }
}

/** Error correction level by style (classic stays high for reliability). */
export function qrErrorCorrection(style: QrStyle): QRCode.QRCodeErrorCorrectionLevel {
  return style === 'modern' ? 'M' : 'H'
}

/**
 * Render a vCard (or any text) to a PNG data URL for preview / download.
 * Returns null on failure so callers can degrade gracefully.
 */
export async function qrCodeToDataURL(
  value: string,
  opts: { size?: number; style?: QrStyle } = {},
): Promise<string | null> {
  try {
    const { dark, light } = qrPalette(opts.style || 'classic')
    return await QRCode.toDataURL(value, {
      width: opts.size || 240,
      margin: 2,
      errorCorrectionLevel: qrErrorCorrection(opts.style || 'classic'),
      color: { dark, light },
    })
  } catch {
    return null
  }
}


