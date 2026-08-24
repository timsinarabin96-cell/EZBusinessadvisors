'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ToastProvider } from '@/components/ui/Toast'
import SearchBar from '@/components/search/SearchBar'
import AuthGuard from '@/components/auth/AuthGuard'
import GuideBot from '@/components/public/GuideBot'
import { supabase } from '@/lib/supabase/client'
import { fetchBrokerBrandContext, fontCss } from '@/lib/branding'

// minRole: 'agent' (daily tools) → 'broker' (deal tools) → 'admin' (everything)
type NavRole = 'agent' | 'broker' | 'admin'
interface NavItem { href: string; label: string; icon: string; minRole: NavRole; group?: string }

const NAV: NavItem[] = [
  // ── OVERVIEW ──────────────────────────────────────────────
  { href: '/dashboard', label: 'Dashboard', icon: '📊', minRole: 'agent', group: 'Overview' },
  { href: '/dashboard/command-center', label: 'Command Center', icon: '🎛️', minRole: 'broker', group: 'Overview' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: '📈', minRole: 'broker', group: 'Overview' },
  { href: '/dashboard/activity', label: 'Activity Feed', icon: '📋', minRole: 'agent', group: 'Overview' },
  { href: '/dashboard/notifications', label: 'Notifications', icon: '🛎️', minRole: 'agent', group: 'Overview' },
  { href: '/dashboard/performance', label: 'Performance', icon: '🏆', minRole: 'broker', group: 'Overview' },
  // ── AI AUTOPILOT ──────────────────────────────────────────
  { href: '/dashboard/autopilot', label: 'Deal Autopilot', icon: '✨', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/intelligence', label: 'Intelligence Network', icon: '◇', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/deal-twin', label: 'Deal Twin', icon: '💠', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/deal-doctor', label: 'Deal Doctor', icon: '🩺', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/call-summaries', label: 'Call Summaries', icon: '🎧', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/data-room-qa', label: 'Data Room Q&A', icon: '💬', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/visitor-intent', label: 'Visitor Intent', icon: '👀', minRole: 'broker', group: 'AI Autopilot' },
  { href: '/dashboard/red-flags', label: 'Red Flags', icon: '🔎', minRole: 'broker', group: 'AI Autopilot' },
  // ── DEALS & LISTINGS ──────────────────────────────────────
  { href: '/pipeline', label: 'Deal Pipeline', icon: '🔄', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/listings', label: 'Listings', icon: '🏢', minRole: 'agent', group: 'Deals & Listings' },
  { href: '/dashboard/listings/new', label: 'New Listing', icon: '➕', minRole: 'agent', group: 'Deals & Listings' },
  { href: '/leads', label: 'Lead Management', icon: '🎯', minRole: 'agent', group: 'Deals & Listings' },
  { href: '/dashboard/seller-leads', label: 'Seller Leads', icon: '🏷️', minRole: 'agent', group: 'Deals & Listings' },
  { href: '/dashboard/loi', label: 'LOI Lab', icon: '📝', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/offer-lab', label: 'Offer Lab', icon: '🧪', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/negotiation', label: 'Negotiation', icon: '🧭', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/nda-requests', label: 'NDA Requests', icon: '🛡️', minRole: 'agent', group: 'Deals & Listings' },
  { href: '/dashboard/closing', label: 'Closing Tracker', icon: '🏁', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/comps', label: 'Comps', icon: '📊', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/valuation', label: 'Valuation', icon: '📐', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/valuation-reports', label: 'Sellable Reports', icon: '💎', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/lead-marketplace', label: 'Lead Marketplace', icon: '🤝', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/readiness', label: 'Seller Readiness', icon: '🌱', minRole: 'broker', group: 'Deals & Listings' },
  { href: '/dashboard/expiry', label: 'Listing Expiry', icon: '⏳', minRole: 'broker', group: 'Deals & Listings' },
  // ── CLIENTS & DOCS ────────────────────────────────────────
  { href: '/dashboard/portal', label: 'Client Portal', icon: '👥', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/dashboard/watchlist', label: 'Deal Alerts', icon: '🔔', minRole: 'agent', group: 'Clients & Docs' },
  { href: '/dashboard/professionals', label: 'Professional Network', icon: '🤝', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/dashboard/referrals', label: 'Referrals', icon: '🎁', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/dashboard/search', label: 'Search', icon: '🔍', minRole: 'agent', group: 'Clients & Docs' },
  { href: '/documents', label: 'Documents', icon: '📁', minRole: 'agent', group: 'Clients & Docs' },
  { href: '/due-diligence', label: 'Due Diligence', icon: '🔍', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/dashboard/financial-files', label: 'Financial Files', icon: '🗂️', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/recast', label: 'Financial Recast', icon: '📊', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/cim', label: 'CIM Generator', icon: '📑', minRole: 'broker', group: 'Clients & Docs' },
  { href: '/bov', label: 'BOV Generator', icon: '⚖️', minRole: 'broker', group: 'Clients & Docs' },
  // ── MARKETING & GROWTH ────────────────────────────────────
  { href: '/dashboard/marketing', label: 'Marketing', icon: '🖨️', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/social', label: 'Social Media', icon: '📣', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/newspaper', label: 'Weekly Newspaper', icon: '📰', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/blog', label: 'Blog & Insights', icon: '📝', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/nurture', label: 'Nurture Drips', icon: '💌', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/syndication', label: 'Syndication', icon: '🔗', minRole: 'broker', group: 'Marketing & Growth' },
  { href: '/dashboard/email-templates', label: 'Email Templates', icon: '✉️', minRole: 'broker', group: 'Marketing & Growth' },
  // ── TEAM & OFFICE ─────────────────────────────────────────
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅', minRole: 'agent', group: 'Team & Office' },
  { href: '/dashboard/communications', label: 'Communications', icon: '🗒️', minRole: 'agent', group: 'Team & Office' },
  { href: '/dashboard/reminders', label: 'Call-Backs & Reminders', icon: '📞', minRole: 'agent', group: 'Team & Office' },
  { href: '/dashboard/training', label: 'Training', icon: '🎓', minRole: 'agent', group: 'Team & Office' },
  { href: '/dashboard/agents', label: 'Agents', icon: '🤖', minRole: 'admin', group: 'Team & Office' },
  { href: '/dashboard/hiring', label: 'Hiring', icon: '🤝', minRole: 'admin', group: 'Team & Office' },
  { href: '/dashboard/onboarding', label: 'Onboarding', icon: '🚀', minRole: 'admin', group: 'Team & Office' },
  // ── ADMIN ─────────────────────────────────────────────────
  { href: '/dashboard/commissions', label: 'Commissions', icon: '💰', minRole: 'admin', group: 'Admin' },
  { href: '/dashboard/review-queue', label: 'Review Queue', icon: '🗂️', minRole: 'admin', group: 'Admin' },
  { href: '/dashboard/tools', label: 'CSV Tools', icon: '🧰', minRole: 'broker', group: 'Admin' },
  { href: '/dashboard/security', label: 'Security', icon: '🛂', minRole: 'admin', group: 'Admin' },
  { href: '/agencies', label: 'Agency Admin', icon: '🏛️', minRole: 'admin', group: 'Admin' },
  { href: '/billing', label: 'Billing', icon: '💳', minRole: 'admin', group: 'Admin' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️', minRole: 'admin', group: 'Admin' },
]

export default function AppShell({
  active,
  children,
}: {
  active?: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [role, setRole] = useState<NavRole>('agent')
  const [brand, setBrand] = useState<{ name: string | null; logo: string | null; primary: string; accent: string; font: string } | null>(null)

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
        // Resolve nav level: owner/admin → admin, broker → broker, else agent.
        const m = member as { role?: string; is_owner?: boolean | null } | null
        if (profile?.role === 'admin' || m?.is_owner || m?.role === 'admin') setRole('admin')
        else if (profile?.role === 'broker' || m?.role === 'broker') setRole('broker')
        else setRole('agent')
      } catch { /* degrade */ }
    })()
  }, [])

  const roleRank: Record<NavRole, number> = { agent: 0, broker: 1, admin: 2 }
  const visibleNav = NAV.filter((item) => roleRank[item.minRole] <= roleRank[role])

  const isActive = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))

  return (
    <AuthGuard>
      <ToastProvider>
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
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
          <div style={{ padding: '26px 20px 20px', borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
            {brand?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo} alt="agency logo" style={{ maxHeight: 40, maxWidth: '100%', marginBottom: 6, objectFit: 'contain' }} />
            ) : (
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: brand?.font || 'Georgia, serif', color: '#fff', letterSpacing: 0.5 }}>
                {brand?.name || 'EZ Business Advisors'}
              </div>
            )}
            <div style={{ fontSize: 11, letterSpacing: '0.28em', color: 'var(--gold-light)', textTransform: 'uppercase', marginTop: 2 }}>
              Broker CRM
            </div>
            <div style={{ height: 2, width: 40, background: 'var(--gold)', marginTop: 10 }} />
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
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
            {(() => {
              const groups: { name: string; items: NavItem[] }[] = []
              for (const item of visibleNav) {
                const name = item.group || 'Other'
                const g = groups.find((x) => x.name === name)
                if (g) g.items.push(item)
                else groups.push({ name, items: [item] })
              }
              return groups.map((g) => {
                const isCollapsed = !!collapsed[g.name]
                const showAll = !!expandedGroups[g.name]
                const items = showAll ? g.items : g.items.slice(0, 8)
                const hasMore = g.items.length > 8
                return (
                <div key={g.name} style={{ marginBottom: 14 }}>
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !isCollapsed }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '6px 14px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}
                  >
                    <span>{g.name}</span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                  {!isCollapsed && (
                    <>
                  {items.map((item) => {
                    const activeItem = isActive(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 14px', marginBottom: 3, borderRadius: 8,
                          textDecoration: 'none', fontSize: 14,
                          fontFamily: 'Georgia, serif',
                          color: activeItem ? '#fff' : 'rgba(255,255,255,0.65)',
                          background: activeItem ? 'rgba(201,168,76,0.18)' : 'transparent',
                          borderLeft: activeItem ? `3px solid var(--gold)` : '3px solid transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                        {item.label}
                      </Link>
                    )
                  })}
                  {hasMore && (
                    <button
                      onClick={() => setExpandedGroups((e) => ({ ...e, [g.name]: !showAll }))}
                      style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '6px 14px 6px 44px', fontSize: 11.5, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.04em' }}
                    >
                      {showAll ? '▴ Show fewer' : `▾ Show all (${g.items.length})`}
                    </button>
                  )}
                    </>
                  )}
                </div>
                )
              })
            })()}
          </nav>

          {/* Footer */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(201,168,76,0.3)', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            EZ Business Advisors · v1.0
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top header with global search */}
          <div style={{ padding: '14px 40px', borderBottom: '1px solid var(--line)', background: '#fff', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: 420 }}>
              <SearchBar backdrop />
            </div>
          </div>
          <div style={{ padding: '32px 40px' }}>
            {children}
          </div>
        </main>
        </div>
        <GuideBot mode="crm" />
      </ToastProvider>
    </AuthGuard>
  )
}
