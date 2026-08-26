/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// eSign — provider abstraction for electronic signatures (2026-08-26).
//   * DocuSign (REST v2) and Dropbox Sign / HelloSign (REST) are supported.
//   * Activates automatically when provider keys are configured; otherwise
//     returns { ok:false, reason:'not_configured' } so the UI falls back to
//     the in-app signature pad (document_signatures table).
//   * Provider choice: DOCUSIGN_* keys → DocuSign; HELLOSIGN_* keys → HelloSign.
// Server-only.
// =============================================================================

export interface EsignParty {
  name: string
  email: string
  role?: string // signer | cc
}

export interface EsignDocument {
  name: string
  /** Base64-encoded file bytes (PDF preferred). */
  contentBase64: string
  fileType?: string
}

export interface EsignRequestInput {
  document: EsignDocument
  parties: EsignParty[]
  subject?: string
  message?: string
}

export interface EsignRequestResult {
  ok: boolean
  provider?: 'docusign' | 'hellosign' | null
  signatureRequestId?: string
  signingUrl?: string | null
  reason?: string
}

export function esignConfigured(): 'docusign' | 'hellosign' | null {
  if (process.env.DOCUSIGN_ACCESS_TOKEN && process.env.DOCUSIGN_ACCOUNT_ID) return 'docusign'
  if (process.env.HELLOSIGN_API_KEY) return 'hellosign'
  return null
}

/** Create a signature request on the configured provider. */
export async function createEsignRequest(input: EsignRequestInput): Promise<EsignRequestResult> {
  const provider = esignConfigured()
  if (!provider) {
    return { ok: false, reason: 'not_configured' }
  }

  if (provider === 'hellosign') {
    try {
      const form = new URLSearchParams()
      form.set('title', input.document.name)
      form.set('subject', input.subject || `Please sign: ${input.document.name}`)
      form.set('message', input.message || 'Please review and sign this document.')
      input.parties.forEach((p, i) => {
        form.set(`signers[${i}][name]`, p.name)
        form.set(`signers[${i}][email_address]`, p.email)
        form.set(`signers[${i}][order]`, String(i))
      })
      // file[0] must be a multipart file; HelloSign accepts base64 via data URI
      form.set('file[0]', `data:${input.document.fileType || 'application/pdf'};base64,${input.document.contentBase64}`)

      const res = await fetch('https://api.hellosign.com/v3/signature_request/create', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.HELLOSIGN_API_KEY}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      })
      if (!res.ok) return { ok: false, provider: 'hellosign', reason: `hellosign_error_${res.status}` }
      const j = await res.json()
      const req = j?.signature_request
      if (!req?.signature_request_id) return { ok: false, provider: 'hellosign', reason: 'missing_id' }
      const signer = req?.signatures?.[0]
      return {
        ok: true,
        provider: 'hellosign',
        signatureRequestId: req.signature_request_id,
        signingUrl: signer?.signature_url || null,
      }
    } catch {
      return { ok: false, provider: 'hellosign', reason: 'hellosign_call_failed' }
    }
  }

  // DocuSign REST v2 (JWT/legacy access token).
  try {
    const base = process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net/restapi'
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID
    const token = process.env.DOCUSIGN_ACCESS_TOKEN

    // 1) Create envelope
    const signers = input.parties.filter((p) => p.role !== 'cc').map((p, i) => ({
      name: p.name,
      email: p.email,
      recipientId: String(i + 1),
      routingOrder: String(i + 1),
    }))
    const carbonCopies = input.parties.filter((p) => p.role === 'cc').map((p, i) => ({
      name: p.name,
      email: p.email,
      recipientId: String(signers.length + i + 1),
      routingOrder: '1',
    }))
    const tabs = {
      signHereTabs: signers.map((s) => ({
        recipientId: s.recipientId,
        documentId: '1',
        pageNumber: '1',
        xPosition: '200',
        yPosition: '300',
      })),
    }
    const envelope = {
      emailSubject: input.subject || `Please sign: ${input.document.name}`,
      documents: [{ documentId: '1', name: input.document.name, documentBase64: input.document.contentBase64 }],
      recipients: { signers, carbonCopies: carbonCopies.length ? carbonCopies : undefined },
      status: 'sent',
    }

    const envRes = await fetch(`${base}/v2.1/accounts/${accountId}/envelopes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    })
    if (!envRes.ok) return { ok: false, provider: 'docusign', reason: `docusign_env_${envRes.status}` }
    const env = await envRes.json()
    const envelopeId = env?.envelopeId
    if (!envelopeId) return { ok: false, provider: 'docusign', reason: 'missing_envelope_id' }

    // 2) Get the embedded signing URL for the first signer.
    const viewRes = await fetch(`${base}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/views/recipient`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authenticationMethod: 'none',
        clientUserId: signers[0]?.recipientId || '1',
        recipientId: signers[0]?.recipientId || '1',
        returnUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://concord-deal-platform.vercel.app',
      }),
    })
    const view = viewRes.ok ? await viewRes.json() : null

    return {
      ok: true,
      provider: 'docusign',
      signatureRequestId: envelopeId,
      signingUrl: view?.url || null,
    }
  } catch {
    return { ok: false, provider: 'docusign', reason: 'docusign_call_failed' }
  }
}
