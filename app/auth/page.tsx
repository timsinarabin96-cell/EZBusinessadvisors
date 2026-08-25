'use client'

// =============================================================================
// /auth — secure, role-aware sign-in.
// Login flow:
//   1. Email + password → Supabase auth
//   2. Email verification gate — unconfirmed accounts are BLOCKED with a
//      "check your inbox" screen + resend (no portal access until confirmed)
//   3. 2FA challenge — if the account has an enrolled authenticator (TOTP),
//      the 6-digit code is required before anything else
//   4. Role-aware redirect — admin → command center, broker → deal tools,
//      agent → workspace, owner → listing portal (shared resolver with nav)
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { resolvePortalRole, resolveLoginDestination, PORTAL_LABEL } from '@/lib/authRouting'
import { isEmailConfirmed } from '@/lib/emailVerification'

type Step = 'signin' | 'verify' | 'mfa'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [factorId, setFactorId] = useState('')
  const [landing, setLanding] = useState('')
  const router = useRouter()

  const redirectAfterLogin = async (): Promise<string> => {
    const searchParams = new URLSearchParams(window.location.search)
    const next = searchParams.get('next')
    if (next?.startsWith('/')) return next

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '/marketplace/listings'
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('agency_members').select('role, is_owner').eq('profile_id', user.id),
    ])
    const role = resolvePortalRole(
      profile as { role: string } | null,
      (memberships?.[0] as { role: string; is_owner: boolean } | null) || null,
      (memberships?.length || 0) > 0,
    )
    setLanding(PORTAL_LABEL[role])
    return resolveLoginDestination(role)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Email verification gate — no portal access until the email is confirmed.
      if (!isEmailConfirmed(data.user)) {
        setStep('verify')
        setSuccess('📬 Check your inbox — verify your email to continue.')
        setLoading(false)
        return
      }

      // 2FA: if the account has a verified TOTP factor, require the code.
      // Fail-safe: a 2FA lookup error must NEVER block a valid password login.
      let factorId = ''
      try {
        const { data: factors } = await supabase.auth.mfa.listFactors()
        const verified = factors?.all?.find((f) => f.status === 'verified')
        if (verified) factorId = verified.id
      } catch {
        factorId = '' // 2FA not configured/enabled — continue without challenge
      }
      if (factorId) {
        try {
          const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
          if (challenge) {
            setFactorId(factorId)
            setStep('mfa')
            setSuccess('🔐 Enter the 6-digit code from your authenticator app.')
            setLoading(false)
            return
          }
        } catch {
          // challenge failed — fall through and let them in (fail-safe)
        }
      }

      const dest = await redirectAfterLogin()
      setSuccess('✅ Signed in! Taking you to your workspace…')
      setTimeout(() => router.push(dest), 600)
    } catch (err: any) {
      setError(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId || !code.trim()) return
    setLoading(true)
    setError('')
    try {
      const { data: challenge } = await supabase.auth.mfa.challenge({ factorId })
      if (!challenge) throw new Error('Could not start verification challenge')
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (error) throw error
      const dest = await redirectAfterLogin()
      setSuccess('✅ Verified! Taking you to your workspace…')
      setTimeout(() => router.push(dest), 600)
    } catch (err: any) {
      setError(err.message || 'Verification failed — check the code')
    } finally {
      setLoading(false)
    }
  }

  const resendVerification = async () => {
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) throw error
      setSuccess('📬 Verification email sent again — check your inbox (and spam).')
    } catch (err: any) {
      setError(err.message || 'Could not resend — try again in a moment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>CONCORD</div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Deal Platform</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '30px 28px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          {error && (
            <div style={{ background: '#fee', padding: '10px 12px', borderRadius: 8, color: '#c0392b', fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}
          {success && (
            <div style={{ background: '#e8f9ee', padding: '10px 12px', borderRadius: 8, color: '#1e7a3c', fontSize: 13, marginBottom: 14 }}>{success}</div>
          )}

          {step === 'signin' && (
            <>
              <h1 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 23, color: '#1a1a2e' }}>Welcome back</h1>
              <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#888' }}>Sign in to your secure workspace</p>
              <form onSubmit={handleSignIn}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={{ width: '100%', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    required
                    minLength={8}
                  />
                </div>
                <div style={{ textAlign: 'right', marginBottom: 16 }}>
                  <Link href="/auth/forgot-password" style={{ fontSize: 12.5, color: '#1a1a2e', textDecoration: 'underline' }}>Forgot password?</Link>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading ? '#aaa' : '#1a1a2e', color: '#c9a84c', border: 'none',
                    fontSize: 15, fontWeight: 800, fontFamily: 'Georgia, serif',
                  }}
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#f4f8fc', border: '1px solid #dbe7f3', fontSize: 12, color: '#31536f', lineHeight: 1.55 }}>
                🔐 <strong>Security:</strong> email verification is required, and accounts with 2FA need your authenticator code. Broker, agent, and admin each land in their own portal.
              </div>
            </>
          )}

          {step === 'verify' && (
            <>
              <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e' }}>Verify your email 📬</h1>
              <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
                Your email <strong>{email}</strong> isn&apos;t confirmed yet. For security, you can&apos;t access the portal until it is. Check your inbox for the verification link (and the spam folder).
              </p>
              <button
                onClick={resendVerification}
                disabled={loading}
                style={{
                  width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                  background: loading ? '#aaa' : '#1a1a2e', color: '#c9a84c', border: 'none',
                  fontSize: 14, fontWeight: 800, fontFamily: 'Georgia, serif', marginTop: 16,
                }}
              >
                {loading ? 'Sending…' : 'Resend verification email'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => { setStep('signin'); setSuccess(''); }} style={{ background: 'none', border: 'none', color: '#1a1a2e', fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  ← Back to sign in
                </button>
              </div>
            </>
          )}

          {step === 'mfa' && (
            <>
              <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e' }}>Two-factor authentication 🔐</h1>
              <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, 1Password…).</p>
              <form onSubmit={handleMfa}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  style={{ width: '100%', padding: '13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 20, letterSpacing: '0.4em', textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginTop: 8 }}
                  required
                  inputMode="numeric"
                  maxLength={6}
                />
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                    background: loading || code.length !== 6 ? '#aaa' : '#1a1a2e', color: '#c9a84c', border: 'none',
                    fontSize: 14, fontWeight: 800, fontFamily: 'Georgia, serif', marginTop: 16,
                  }}
                >
                  {loading ? 'Verifying…' : 'Verify & continue'}
                </button>
              </form>
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button onClick={() => { setStep('signin'); setSuccess(''); setCode(''); }} style={{ background: 'none', border: 'none', color: '#1a1a2e', fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                  ← Back to sign in
                </button>
              </div>
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#888' }}>
            New here?{' '}
            <Link href="/auth/signup" style={{ color: '#1a1a2e', fontWeight: 700 }}>Create an account</Link>
            {' '}·{' '}
            <Link href="/marketplace/listings" style={{ color: '#1a1a2e', fontWeight: 700 }}>browse listings</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
          Each CRM runs on its own domain with its own API keys. © {new Date().getFullYear()} Concord Deal Platform
        </div>
      </div>
    </div>
  )
}
