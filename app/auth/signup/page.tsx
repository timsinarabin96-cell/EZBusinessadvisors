/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /auth/signup — friendly account creation with persona selection.
//   * Business Owner → free tier: 1 listing, no CRM (login + add listing)
//   * Broker / Agency → creates an agency, starts trial, then billing
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { passwordIssue, PASSWORD_POLICY } from '@/lib/emailVerification'

type Persona = 'owner' | 'buyer'

export default function SignupPage() {
  const [persona, setPersona] = useState<Persona>('owner')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentVerification, setSentVerification] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Strong password policy — enforced before we ever call Supabase.
    const pwIssue = passwordIssue(password)
    if (pwIssue) {
      setError(pwIssue)
      setLoading(false)
      return
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) throw signUpError
      const user = data.user
      if (!user) throw new Error('Account creation failed — please try again.')

      // Create/upsert the profile row.
      const roleForPersona = persona === 'buyer' ? 'buyer' : 'owner'
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email,
        full_name: name,
        role: roleForPersona,
        status: 'active',
      }, { onConflict: 'id' })
      if (profileError) throw new Error(profileError.message || 'Failed to create profile')

      // Email verification is REQUIRED — the portal stays locked until the
      // user confirms. We show the check-your-inbox screen instead of
      // auto-redirecting into the app.
      if (!user.email_confirmed_at) {
        setSentVerification(true)
        setLoading(false)
        return
      }

      // Owner → straight to their listing portal; buyer → their match dashboard.
      router.push(persona === 'buyer' ? '/dashboard/buyer' : '/auth?next=/dashboard/owner')
    } catch (err: any) {
      setError(err.message || 'Sign up failed')
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
      setSentVerification(true)
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
          {sentVerification ? (
            <>
              <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 22, color: '#1a1a2e' }}>Check your inbox 📬</h1>
              <p style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
                We sent a verification link to <strong>{email}</strong>. Click it to confirm your email — your account stays locked until you do (it&apos;s how we keep accounts from being hijacked).
              </p>
              <p style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>Didn&apos;t get it? Check spam, or resend below.</p>
              <button onClick={resendVerification} disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', background: loading ? '#aaa' : '#1a1a2e', color: '#c9a84c', border: 'none', fontSize: 14, fontWeight: 800, fontFamily: 'Georgia, serif', marginTop: 12 }}>
                {loading ? 'Sending…' : 'Resend verification email'}
              </button>
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Link href="/auth" style={{ color: '#1a1a2e', fontWeight: 700, fontSize: 13 }}>← Back to sign in</Link>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 23, color: '#1a1a2e' }}>Create your account</h1>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#888' }}>Choose how you'll use the platform.</p>

          {/* Persona picker — owner lists a business, buyer hunts deals. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 22 }}>
            <button
              type="button"
              onClick={() => setPersona('owner')}
              style={{ padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center', border: persona === 'owner' ? '2px solid #c9a84c' : '1px solid #ece8dc', background: persona === 'owner' ? 'rgba(201,168,76,0.1)' : '#fff' }}
            >
              <div style={{ fontSize: 22 }}>🏪</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>Business Owner</div>
              <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>List your business — one-time free listing</div>
            </button>
            <button
              type="button"
              onClick={() => setPersona('buyer')}
              style={{ padding: '14px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center', border: persona === 'buyer' ? '2px solid #c9a84c' : '1px solid #ece8dc', background: persona === 'buyer' ? 'rgba(201,168,76,0.1)' : '#fff' }}
            >
              <div style={{ fontSize: 22 }}>🔍</div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>Buyer</div>
              <div style={{ fontSize: 10.5, color: '#999', marginTop: 3 }}>Search & get matched to businesses free</div>
            </button>
          </div>
          <p style={{ margin: '-8px 0 18px', fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            {persona === 'buyer'
              ? '📈 <strong>Buyer accounts are free.</strong> Save searches, bookmark listings, and get AI match alerts when a business you qualify for goes live.'
              : '🔍 <strong>Buying a business?</strong> Create a free buyer account to get matched to new listings the moment they go live.'}
          </p>

          {error && <div style={{ background: '#fee', padding: '10px 12px', borderRadius: 8, color: '#c0392b', fontSize: 13, marginBottom: 14 }}>{error}</div>}

          <form onSubmit={handleSignUp}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Full name</label>
              <input type="text" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} required />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Email</label>
              <input type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} required />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#555', marginBottom: 5 }}>Password</label>
              <input type="password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters, letter + number" style={inputStyle} required minLength={8} />
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 5 }}>Strong password required: 8+ characters with a letter and a number. Email verification is mandatory for every account.</div>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', background: loading ? '#aaa' : '#1a1a2e', color: '#c9a84c', border: 'none', fontSize: 15, fontWeight: 800, fontFamily: 'Georgia, serif' }}>
              {loading ? 'Creating account…' : persona === 'buyer' ? 'Create Free Buyer Account' : 'Create Free Owner Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#888' }}>
            Already have an account?{' '}
            <Link href="/auth" style={{ color: '#1a1a2e', fontWeight: 700 }}>Sign in</Link>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 13px', border: '1px solid #d8d2c2', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
