/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ToastProvider } from '@/components/ui/Toast'
import SearchBar from '@/components/search/SearchBar'
import AuthGuard from '@/components/auth/AuthGuard'
import GuideBot from '@/components/public/GuideBot'
import CommandPalette from '@/components/layout/CommandPalette'
import { supabase } from '@/lib/supabase/client'
import { fetchBrokerBrandContext, fontCss } from '@/lib/branding'
import { resolvePortalRole } from '@/lib/authRouting'
import { NAV, navForRole, type NavRole, type NavItem } from '@/components/layout/navConfig'

const RECENT_KEY = 'concord-recent-nav'

export default function AppShell({
  active,
  children,
}: {
  active?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAllTools, setShowAllTools] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [role, setRole] = useState<NavRole>('agent')
  const [brand, setBrand] = useState<{ name: string | null; logo: string | null; primary: string; accent: string; font: string } | null>(null)
  const [recent, setRecent] = useState<NavItem[]>([])

  // Apply the agency's white-label brand to the CRM chrome (CSS vars).
  useEffect(() => {
    (async () => {
      try {
        const ctx = await fetchBrokerBrandContext()
        if (ctx?.agency) {
          const a = ctx.agency
          setBrand({ name: ctx.agencyName, logo: a.logoUrl, primary: a.primaryColor, accent: a.accentColor, font: fontCss(a.font) })
          const root = document.documentElement
          root.style.setProperty('--navy', a.primaryColor)
          root.style.setProperty('--navy-2', a.secondaryColor)
          root.style.setProperty('--navy-3', a.secondaryColor)
          root.style.setProperty('--gold', a.accentColor)
          root.style.setProperty('--gold-light', a.accentColor)
          root.style.setProperty('--gold-dark', a.accentColor)
        }
      } catch { /* keep defaults */ }
    })()
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const [{ data: profile }, { data: member }] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          supabase.from('agency_members').select('role, is_owner').eq('profile_id', user.id).order('is_owner', { ascending: false }).limit(1).maybeSingle(),
        ])
        if (profile?.role === 'super_admin') setIsPlatformAdmin(true)
        const m = member as { role?: string; is_owner?: boolean | null } | null
        const portalRole = resolvePortalRole(
          profile as { role: string } | null,
          m as { role: string; is_owner: boolean | null } | null,
        )
        if (portalRole === 'super_admin') setIsPlatformAdmin(true)
        const navRole: NavRole = portalRole === 'admin' ? 'admin' : portalRole === 'broker' ? 'broker' : 'agent'
        setRole(navRole)
      } catch { /* degrade */ }
    })()
  }, [])

  // Load + keep the recently-visited nav items (from localStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      if (raw) {
        const hrefs: string[] = JSON.parse(raw)
        const byHref = new Map(NAV.map((n) => [n.href, n]))
        setRecent(hrefs.map((h) => byHref.get(h)).filter(Boolean) as NavItem[])
      }
    } catch { /* ignore */ }
  }, [])

  const recordRecent = (href: string) => {
    setRecent((prev) => {
      const next = [NAV.find((n) => n.href === href), ...prev.filter((n) => n.href !== href)]
        .filter(Boolean).slice(0, 5) as NavItem[]
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next.map((n) => n.href))) } catch { /* ignore */ }
      return next
    })
  }

  const visibleNav = navForRole(role)
  const coreNav = visibleNav.filter((item) => item.core)
  const toolNav = visibleNav.filter((item) => !item.core)

  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))

  const handleLogout = async () => {
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
    } catch { /* session may already be gone */ }
    router.push('/auth')
  }

  const renderLink = (item: NavItem, showIcon = true) => {
    const activeItem = isActive(item.href)
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => { setOpen(false); recordRecent(item.href) }}
        className="crm-nav-link"
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '9px 14px', marginBottom: 2, borderRadius: 10,
          textDecoration: 'none', fontSize: 14,
          fontFamily: 'var(--font-sans)',
          color: activeItem ? '#fff' : 'rgba(255,255,255,0.66)',
          background: activeItem ? 'linear-gradient(90deg, rgba(201,168,76,0.22), rgba(201,168,76,0.06))' : 'transparent',
          boxShadow: activeItem ? 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.25)' : 'none',
          borderLeft: activeItem ? '3px solid var(--gold)' : '3px solid transparent',
          transition: 'all 0.16s ease',
        }}
      >
        {showIcon && <span style={{ fontSize: 16, width: 22, textAlign: 'center', filter: activeItem ? 'drop-shadow(0 2px 6px rgba(201,168,76,0.5))' : 'none' }}>{item.icon}</span>}
        {item.label}
      </Link>
    )
  }

  const renderGroup = (name: string, items: NavItem[]) => {
    const isCollapsed = !!collapsed[name]
    return (
      <div key={name} style={{ marginBottom: 12 }}>
        <button
          onClick={() => setCollapsed((c) => ({ ...c, [name]: !isCollapsed }))}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '6px 14px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}
        >
          <span>{name}</span>
          <span style={{ fontSize: 10, opacity: 0.7 }}>{isCollapsed ? '▸' : '▾'}</span>
        </button>
        {!isCollapsed && items.map((item) => renderLink(item))}
      </div>
    )
  }

  // Group core nav by group name (preserving NAV order).
  const coreGroups: { name: string; items: NavItem[] }[] = []
  for (const item of coreNav) {
    const g = coreGroups.find((x) => x.name === item.group)
    if (g) g.items.push(item)
    else coreGroups.push({ name: item.group, items: [item] })
  }

  // All tools, grouped the same way.
  const toolGroups: { name: string; items: NavItem[] }[] = []
  for (const item of toolNav) {
    const g = toolGroups.find((x) => x.name === item.group)
    if (g) g.items.push(item)
    else toolGroups.push({ name: item.group, items: [item] })
  }

  const linkStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8,
    padding: '9px 0', fontSize: 13, fontWeight: 700, textDecoration: 'none',
    fontFamily: 'Georgia, serif',
  }

  return (
    <AuthGuard>
      <ToastProvider>
        <CommandPalette items={visibleNav} role={role} onNavigate={recordRecent} />
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
          <a href="#app-shell-main" className="skip-link">Skip to content</a>
        {/* Mobile toggle */}
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 60,
            display: open ? 'none' : 'inline-flex',
            background: 'var(--navy)', color: '#fff', border: 'none',
            borderRadius: 6, padding: '8px 12px', fontSize: 16, cursor: 'pointer',
          }}
        >
          ☰
        </button>

        {/* Overlay for mobile */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 49, display: 'block' }}
          />
        )}

        {/* Sidebar */}
        <aside
          className="app-shell-aside"
          style={{
            width: 240, flexShrink: 0,
            background: 'linear-gradient(180deg, var(--navy) 0%, var(--navy-2) 100%)',
            color: '#fff', display: 'flex', flexDirection: 'column',
            position: 'sticky', top: 0, height: '100vh',
            transition: 'transform 0.25s ease', zIndex: 50,
            transform: open ? 'translateX(0)' : undefined,
          }}
        >
          {/* Brand — white-label: agency logo + name, or fallback text */}
          <div style={{ padding: '26px 20px 20px', borderBottom: '1px solid rgba(201,168,76,0.22)', background: 'linear-gradient(180deg, rgba(255,255,255,0.05), transparent)' }}>
            {brand?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="agency logo" style={{ maxHeight: 40, maxWidth: '100%', marginBottom: 6, objectFit: 'contain' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, rgba(201,168,76,0.9), rgba(176,141,53,0.75))', color: '#0f1023', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, boxShadow: '0 6px 18px rgba(201,168,76,0.35)' }}>🌒</span>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, fontFamily: brand?.font || 'var(--font-display)', color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                    {brand?.name || 'EZ Business Advisors'}
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: '0.28em', color: 'var(--gold-light)', textTransform: 'uppercase', marginTop: 3, fontWeight: 700 }}>
                    Broker CRM
                  </div>
                </div>
              </div>
            )}
            <div style={{ height: 2, width: 46, background: 'linear-gradient(90deg, var(--gold), transparent)', marginTop: 14, borderRadius: 2 }} />
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
            {/* Command palette trigger */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', marginBottom: 10, borderRadius: 8,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)',
                cursor: 'pointer', color: 'rgba(255,255,255,0.75)', fontSize: 13.5,
                fontFamily: 'Georgia, serif',
              }}
            >
              <span style={{ fontSize: 15 }}>🔍</span>
              <span style={{ flex: 1, textAlign: 'left' }}>Search tools…</span>
              <kbd style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 5, padding: '1px 6px' }}>⌘K</kbd>
            </button>

            {isPlatformAdmin && (
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 14px', marginBottom: 8, borderRadius: 8,
                  textDecoration: 'none', fontSize: 14.5,
                  fontFamily: 'Georgia, serif',
                  color: active === 'Admin' ? '#fff' : '#c9a84c',
                  background: active === 'Admin' ? 'rgba(201,168,76,0.18)' : 'rgba(201,168,76,0.08)',
                  borderLeft: active === 'Admin' ? '3px solid var(--gold)' : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: 17 }}>🛡️</span>
                Platform Admin
              </Link>
            )}

            {/* Recent */}
            {recent.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ padding: '6px 14px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                  Recent
                </div>
                {recent.map((item) => renderLink(item, false))}
              </div>
            )}

            {/* Core nav (the ~8 daily tools per role) */}
            {coreGroups.map((g) => renderGroup(g.name, g.items))}

            {/* All Tools — progressive disclosure for the long tail */}
            {toolNav.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <button
                  onClick={() => setShowAllTools((s) => !s)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer', textAlign: 'left', padding: '9px 14px', borderRadius: 8,
                    fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  <span>🗂️ All Tools ({toolNav.length})</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{showAllTools ? '▾' : '▸'}</span>
                </button>
                {showAllTools && (
                  <div style={{ marginTop: 8 }}>
                    {toolGroups.map((g) => renderGroup(g.name, g.items))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Footer — logout + back to website on every page */}
          <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(201,168,76,0.3)', display: 'grid', gap: 8 }}>
            <Link href="/marketplace" style={linkStyle}>
              🌐 Back to Website
            </Link>
            <button
              onClick={handleLogout}
              disabled={signingOut}
              style={{
                ...linkStyle,
                background: signingOut ? '#666' : 'rgba(201,168,76,0.16)',
                border: '1px solid rgba(201,168,76,0.45)',
                cursor: signingOut ? 'wait' : 'pointer',
              }}
            >
              {signingOut ? 'Signing out…' : '🚪 Logout'}
            </button>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
              EZ Business Advisors · v1.0
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="app-shell-main" id="app-shell-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top header — frosted glass with global search + back arrow */}
          <div className="crm-topbar" style={{ position: 'sticky', top: 0, zIndex: 40, padding: '12px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <button
              onClick={() => { if (window.history.length > 1) router.back(); else router.push('/dashboard') }}
              title="Go back"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.1)', background: 'rgba(255,255,255,0.7)', color: 'var(--navy)', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}
            >
              ← Back
            </button>
            <div style={{ width: '100%', maxWidth: 420 }}>
              <SearchBar backdrop />
            </div>
          </div>
          <div style={{ padding: '28px 40px 48px', background: 'linear-gradient(180deg, #faf9f5 0%, var(--paper) 40px)' }}>
            {children}
          </div>
        </main>
        </div>
        <GuideBot mode="crm" />
      </ToastProvider>
    </AuthGuard>
  )
}
