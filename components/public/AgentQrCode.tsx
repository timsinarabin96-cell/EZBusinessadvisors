/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// =============================================================================
// AgentQrCode — scan-to-save vCard QR code for a broker's contact card.
// Encodes the broker's full contact (name, phone, email, website, agency) as a
// vCard, so a phone camera scan auto-saves the contact with the website link —
// buyers keep the broker's info for future contact. Works for every agent in
// the system because it's built from their profile data.
// =============================================================================

interface AgentQrCodeProps {
  name: string
  phone?: string | null
  email?: string | null
  website?: string | null
  agency?: string | null
}

export default function AgentQrCode({ name, phone, email, website, agency }: AgentQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // vCard 3.0 — scanned by any phone camera, offers to save the contact.
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name.replace(/[^\w\s.,'-]/g, '').slice(0, 60) || 'Business Broker'}`,
    ]
    if (agency) lines.push(`ORG:${agency.replace(/[^\w\s.,'-]/g, '').slice(0, 60)}`)
    const tel = phone ? String(phone).replace(/[^\d+]/g, '') : ''
    if (tel) lines.push(`TEL;TYPE=CELL:${tel}`)
    if (email) lines.push(`EMAIL:${email.trim().slice(0, 80)}`)
    const url = website ? website.trim().replace(/[^a-zA-Z0-9:/._-]/g, '').slice(0, 120) : ''
    if (url) lines.push(`URL:${url}`)
    lines.push('END:VCARD')

    QRCode.toDataURL(lines.join('\n'), {
      width: 160,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    })
      .then((url) => { if (!cancelled) setDataUrl(url) })
      .catch(() => { if (!cancelled) setDataUrl(null) })
    return () => { cancelled = true }
  }, [name, phone, email, website, agency])

  if (!dataUrl) return null

  return (
    <div style={{ textAlign: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`Scan to save ${name}'s contact`} width={160} height={160} style={{ display: 'block', borderRadius: 10, border: '1px solid #ece8dc', background: '#fff' }} />
      <div style={{ fontSize: 10.5, color: '#888', marginTop: 6, lineHeight: 1.4 }}>
        Scan to save contact
        <br />
        <span style={{ color: '#8a6d1a', fontWeight: 700 }}>Call · Email · Website</span>
      </div>
    </div>
  )
}
