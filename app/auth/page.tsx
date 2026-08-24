'use client'

// =============================================================================
// /auth — friendly, role-aware sign-in.
// One login page, three clear personas, correct redirect per role:
//   * Platform Admin (super_admin)  → /admin   (see EVERYTHING)
//   * Broker / Agent (CRM member)   → /dashboard
//   * Business Owner / Buyer        → marketplace / owner portal
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Persona = 'admin' | 'crm' | 'owner'

const PERSONAS: { id: Persona; icon: string; label: string; hint: string }[] = [
  { id: 'admin', icon: '🛡️', label: 'Platform Admin', hint: 'Owner of the platform — see everything' },
  { id: 'crm', icon: '💼', label: 'Broker / Agent', hint: 'Sign in to your CRM workspace' },
  { id: 'owner', icon: '🏪', label: 'Business Owner', hint: 'Sign in to manage your free listing' },
]

export default function AuthPage() {
  const [persona, setPersona] = useState<Persona>('crm')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const router = useRouter()

  const redirectAfterLogin = async (): Promise<string> => {
    const searchParams = new URLSearchParams(window.location.search)
    const next = searchParams.get('next')
    if (next?.startsWith('/')) return next

    // Role-aware default landing.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return '/marketplace/listings'
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role === 'super_admin' || profile?.role === 'admin') return '/admin'
    const { data: member } = await supabase
      .from('agency_members')
      .select('agency_id')
      .eq('profile_id', user.id)
      .limit(1)
      .maybeSingle()
    if (member?.agency_id) return '/dashboard'
    // Owner / buyer without a CRM seat → owner portal.
    return '/dashboard/listings'
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setSuccess('✅ Signed in! Taking you to your workspace…')
      const dest = await redirectAfterLogin()
      setTimeout(() => router.push(dest), 700)
    } catch (err: any) {
      setError(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%)', display: 'grid', placeItems: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>CONCORD</div>
          <div style={{ fontSize: 11, letterSpacing: '0.3em', color: '#c9a84c', textTransform: 'uppercase', marginTop: 2 }}>Deal Platform</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '30px 28px', boxShadow: '0 24px 80px rgba(0,0,0,0.4)' }}>
          <h1 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 23, color: '#1a1a2e' }}>Welcome back</h1>
          <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#888' }}>Who are you signing in as?</p>

          {/* Persona picker */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 22 }}>
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPersona(p.id)}
                style={{
                  padding: '12px 6px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  border: persona === p.id ? '2px solid #c9a84c' : '1px solid #ece8dc',
                  background: persona === p.id ? 'rgba(201,168,76,0.1)' : '#fff',
                }}
              >
                <div style={{ fontSize: 22 }}>{p.icon}</div>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1a1a2e', marginTop: 4 }}>{p.label}</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{p.hint.split('—')[0]}</div>
              </button>
            ))}
          </div>

          {error && (
            <div style={{ background: '#fee', padding: '10px 12px', borderRadius: 8, color: '#c0392b', fontSize: 13, marginBottom: 14 }}>{error}</div>
          )}
          {success && (
            <div style={{ background: '#e8f9ee', padding: '10px 12px', borderRadius: 8, color: '#1e7a3c', fontSize: 13, marginBottom: 14 }}>{success}</div>
          )}

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
                minLength={6}
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

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#888' }}>
            New here?{' '}
            <Link href="/auth/signup" style={{ color: '#1a1a2e', fontWeight: 700 }}>Create an account</Link>
            {' '}·{' '}
            <Link href="/marketplace/sell" style={{ color: '#1a1a2e', fontWeight: 700 }}>List your business</Link>
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
