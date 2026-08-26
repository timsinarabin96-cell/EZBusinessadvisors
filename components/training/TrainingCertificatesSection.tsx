'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader } from '@/components/ui'
import TrainingCertificate from './TrainingCertificate'
import CertifiedBrokers from './CertifiedBrokers'
import type { TrainingCertificate as Cert, TrainingModule } from '@/lib/training'

interface VerifiedResult {
  ok: boolean
  reason?: string
  certificate?: {
    id: string
    brokerName: string | null
    brokerEmail: string | null
    moduleTitle: string | null
    issuedAt: string | null
    code: string | null
    verified: boolean
    verifiedAt: string | null
  }
}

/**
 * Certificates section — rendered at the END of the Training tab so agents
 * never leave the page. Shows earned certificates (module + program), a public
 * code-verification tool, and the certified-brokers roster. One tap, one place.
 */
export default function TrainingCertificatesSection({
  certs,
  programCert,
  modules,
}: {
  certs: Cert[]
  programCert: Cert | null
  modules: TrainingModule[]
}) {
  const [brokerName, setBrokerName] = useState('Broker')
  const [agencyName, setAgencyName] = useState<string | null>(null)
  const [agencyLogo, setAgencyLogo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [verify, setVerify] = useState<VerifiedResult | null>(null)
  const [checking, setChecking] = useState(false)

  // White-label branding (agency name + logo) for certificates.
  useEffect(() => {
    (async () => {
      try {
        const { fetchBrokerBrandContext } = await import('@/lib/branding')
        const ctx = await fetchBrokerBrandContext()
        if (ctx?.agencyName) setAgencyName(ctx.agencyName)
        if (ctx?.agency?.logoUrl) setAgencyLogo(ctx.agency.logoUrl)
      } catch { /* keep defaults */ }
    })()
    // Current user's real name from the auth profile.
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase/client')
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.user_metadata?.full_name) setBrokerName(user.user_metadata.full_name)
        else if (user?.email) setBrokerName(user.email.split('@')[0])
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle()
        if (profile?.full_name) setBrokerName(profile.full_name)
      } catch { /* keep fallback */ }
    })()
  }, [])

  const runVerify = async (value?: string) => {
    const trim = (value ?? code).trim()
    if (!trim) return
    setChecking(true)
    try {
      const res = await fetch(`/api/certificates?code=${encodeURIComponent(trim)}`)
      setVerify(await res.json())
    } catch {
      setVerify({ ok: false, reason: 'Verification failed. Try again.' })
    } finally {
      setChecking(false)
    }
  }

  // Auto-fill the verifier from a ?code= deep link (QR scans still work).
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('code')
    if (param) {
      setCode(param.toUpperCase())
      runVerify(param.toUpperCase())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allCerts = programCert && !certs.some((c) => c.module_id === programCert.module_id)
    ? [programCert, ...certs]
    : certs

  const moduleTitle = (moduleId: string) =>
    modules.find((m) => m.id === moduleId)?.title || 'Business Intermediary Course Completion'

  return (
    <div id="certificates" style={{ display: 'flex', flexDirection: 'column', gap: 20, scrollMarginTop: 20 }}>
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 4 }}>🎓 Certificates</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
          Earned right here when you finish a course and its test — no separate page needed.
        </p>
      </div>

      {/* Earned certificates */}
      {allCerts.length === 0 ? (
        <Card>
          <CardHeader title="No certificates yet" subtitle="Complete all lessons in a training module to earn your first certificate." />
        </Card>
      ) : (
        allCerts.map((c) => (
          <TrainingCertificate
            key={c.id}
            brokerName={brokerName}
            agencyName={agencyName}
            agencyLogo={agencyLogo}
            moduleTitle={moduleTitle(c.module_id)}
            moduleId={c.module_id.slice(0, 8)}
            issuedAt={c.issued_at}
            verificationCode={c.verification_code}
            defaultTemplate={(c.template as 'gold' | 'navy' | 'ivory') || 'gold'}
          />
        ))
      )}

      {/* Public verification tool */}
      <Card>
        <CardHeader title="Verify a Certificate" subtitle="Enter a certificate’s 8-character verification code to confirm it’s valid." />
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3K9QX2M"
            style={{
              flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--line)', fontSize: 15, letterSpacing: 2,
              fontFamily: 'monospace', textTransform: 'uppercase',
            }}
          />
          <button className="btn btn-primary" onClick={() => runVerify()} disabled={checking || !code.trim()}>
            {checking ? 'Checking…' : 'Verify'}
          </button>
        </div>
        {verify && (
          <div
            style={{
              margin: '0 20px 20px', padding: 14, borderRadius: 8, fontSize: 14,
              background: verify.ok ? '#f0fdf4' : '#fdf0f0',
              border: '1px solid ' + (verify.ok ? '#bbf7d0' : '#fecaca'),
              color: verify.ok ? '#15803d' : '#b42318',
            }}
          >
            {verify.ok ? (
              <>
                <strong>✓ Valid certificate</strong>
                {verify.certificate && (
                  <div style={{ marginTop: 8, color: '#374151' }}>
                    <div><strong>{verify.certificate.brokerName || 'Broker'}</strong> — {verify.certificate.moduleTitle || 'training module'}</div>
                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Issued {verify.certificate.issuedAt ? new Date(verify.certificate.issuedAt).toLocaleDateString() : ''}
                      {verify.certificate.verified && ' · marked verified'}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <strong>✗ {verify.reason || 'Invalid certificate code.'}</strong>
            )}
          </div>
        )}
      </Card>

      {/* Certified brokers roster */}
      <CertifiedBrokers />
    </div>
  )
}
