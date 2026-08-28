/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { renderTemplateBody } from '@/lib/documentBuilder'

// =============================================================================
// DocumentSheet — polished, letterhead-styled legal document view.
// -----------------------------------------------------------------------------
// Renders a filled legal document the way a client would expect to see it:
//   • branded letterhead (agency logo + name + gold rule)
//   • the FULL agreement text (body_template rendered with filled data)
//   • signature blocks with live status per party
// Used in the client portal so signers can actually read what they're signing,
// and mirrored in the broker dashboard preview.
// =============================================================================

export interface SheetBrand {
  agencyName: string
  logoUrl: string | null
}

export interface SheetParty {
  key: string
  label: string
  role: string
  name: string | null
  email: string | null
}

export interface SheetSignature {
  party_key: string
  party_name: string | null
  role: string | null
  status: 'unsigned' | 'signed' | 'declined' | 'expired'
  signed_at?: string | null
}

export interface SheetDocument {
  id: string
  title: string
  status: string
  body_template?: string | null
  filled_data: Record<string, unknown>
  parties: SheetParty[]
  signatures: SheetSignature[]
  allSigned?: boolean
}

export const PLATFORM_LOGO = '/icons/icon-512.png'
// Primary agency logo — white-background lockup, letterhead-ready.
export const EZ_LOGO = '/brand/ez-business-advisors.jpg'

const ROLE_LABEL: Record<string, string> = {
  agent: 'Broker / Agency',
  seller: 'Seller',
  buyer: 'Buyer',
  custom: 'Party',
}

const ROLE_COLOR: Record<string, string> = {
  agent: '#c9a84c',
  seller: '#15803d',
  buyer: '#2563eb',
  custom: '#7c3aed',
}

const fmtDate = (iso?: string | null): string => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * The branded letterhead used at the top of every generated legal document.
 * Shared with the esign PDF builder (styling mirror) and the portal.
 */
export function Letterhead({ brand }: { brand: SheetBrand }) {
  // The EZ Business Advisors lockup is the default letterhead brand; an agency
  // logo overrides it when one is configured.
  const logo = brand.logoUrl || EZ_LOGO
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px',
        borderBottom: '3px solid #c9a84c', background: '#ffffff',
      }}
    >
      {/* Logo — agency logo when set, else the platform mark */}
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={brand.agencyName}
          style={{ height: 52, width: 'auto', maxWidth: 320, objectFit: 'contain' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 10, background: '#1a1a2e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#c9a84c', fontWeight: 800, fontSize: 18, fontFamily: 'Georgia, serif',
              border: '1px solid rgba(201,168,76,0.4)',
            }}
          >
            EZ
          </div>
          <div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.15 }}>
              {brand.agencyName}
            </div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#8a8678', marginTop: 2 }}>
              Business Brokerage · Concord Deal Platform
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Full legal document sheet: letterhead + agreement text + signature blocks.
 */
export default function DocumentSheet({
  doc,
  brand,
}: {
  doc: SheetDocument
  brand: SheetBrand
}) {
  const body = doc.body_template ? renderTemplateBody(doc.body_template, doc.filled_data || {}) : ''
  const signedCount = doc.signatures.filter((s) => s.status === 'signed').length
  const totalSigs = doc.signatures.length
  const allSigned = doc.allSigned || (totalSigs > 0 && signedCount === totalSigs)

  return (
    <div
      style={{
        background: '#ffffff', border: '1px solid #e5e2d8', borderRadius: 10,
        overflow: 'hidden', boxShadow: '0 1px 4px rgba(26,26,46,0.10)',
      }}
    >
      <Letterhead brand={brand} />

      {/* Title block */}
      <div style={{ padding: '26px 32px 18px', textAlign: 'center', borderBottom: '1px solid #eeeae0' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#8a8678', marginBottom: 6 }}>
          {doc.status === 'signed' ? 'Fully executed document' : doc.status === 'pending_signature' ? 'Awaiting signatures' : 'Document'}
        </div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e', margin: 0, lineHeight: 1.25 }}>
          {doc.title}
        </h2>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block', fontSize: 11.5, fontWeight: 800, padding: '4px 12px', borderRadius: 99,
              background: allSigned ? '#dcfce7' : '#fef3c7', color: allSigned ? '#15803d' : '#b45309',
            }}
          >
            {allSigned ? `✓ Signed by all parties (${signedCount}/${totalSigs})` : `Signatures ${signedCount}/${totalSigs}`}
          </span>
        </div>
      </div>

      {/* Agreement body */}
      <div style={{ padding: '28px 32px' }}>
        {body ? (
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13.5, lineHeight: 1.75,
              color: '#232b3a', whiteSpace: 'pre-wrap',
            }}
          >
            {body}
          </div>
        ) : (
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 13.5, color: '#8a8678' }}>
            (No document body available — the broker will provide the full text.)
          </p>
        )}

        {/* Signature blocks */}
        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {doc.parties.map((p) => {
            const sig = doc.signatures.find((s) => s.party_key === p.key)
            const signed = sig?.status === 'signed'
            const color = ROLE_COLOR[p.role] || '#7c3aed'
            return (
              <div
                key={p.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                  border: '1px solid #eeeae0', borderRadius: 8, background: signed ? '#f7faf6' : '#fcfbf7',
                }}
              >
                <div
                  style={{
                    width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: signed ? '#dcfce7' : '#f3f1ea', fontSize: 15,
                  }}
                >
                  {signed ? '✍️' : '·'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color, fontWeight: 700 }}>
                    {p.label || ROLE_LABEL[p.role] || p.role}
                  </div>
                  <div style={{ fontSize: 13.5, color: signed ? '#1a1a2e' : '#8a8678', fontFamily: 'Georgia, serif' }}>
                    {signed
                      ? (sig?.party_name || p.name || 'Signed party')
                      : (p.name || 'Awaiting signature')}
                    {signed && sig?.signed_at && (
                      <span style={{ color: '#8a8678', fontSize: 12 }}> — signed {fmtDate(sig.signed_at)}</span>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                    background: signed ? '#dcfce7' : '#f3f1ea', color: signed ? '#15803d' : '#8a8678',
                  }}
                >
                  {signed ? 'SIGNED' : 'PENDING'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 32px', borderTop: '1px solid #eeeae0', background: '#faf9f5',
          fontSize: 11, color: '#8a8678', textAlign: 'center',
        }}
      >
        Generated by {brand.agencyName} via Concord Deal Platform · Electronic signature is legally binding
      </div>
    </div>
  )
}
