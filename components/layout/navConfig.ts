/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Shared navigation config for the CRM shell.
// One source of truth for the sidebar AND the Cmd+K command palette.
//
// minRole: 'agent' (daily tools) → 'broker' (deal tools) → 'admin' (everything)
// core:    true  → always visible in the sidebar
//          false → reachable via Command Palette + "All Tools" section
// keywords: extra search terms for the palette (aliases, plurals, jargon)
// =============================================================================

export type NavRole = 'agent' | 'broker' | 'admin'

export interface NavItem {
  href: string
  label: string
  icon: string
  minRole: NavRole
  group: string
  core?: boolean
  keywords?: string
}

export const NAV: NavItem[] = [
  // ── OVERVIEW ──────────────────────────────────────────────
  { href: '/dashboard', label: 'Dashboard', icon: '📊', minRole: 'agent', group: 'Overview', core: true, keywords: 'home home' },
  { href: '/dashboard/command-center', label: 'Command Center', icon: '🎛️', minRole: 'broker', group: 'Overview', core: true, keywords: 'cockpit hub today performance kpi goals targets analytics stats metrics charts leaderboard' },
  { href: '/dashboard/activity', label: 'Activity Feed', icon: '📋', minRole: 'agent', group: 'Overview', keywords: 'log audit trail notifications alerts bell digests' },

  // ── AI AUTOPILOT (one cockpit, tabs per tool) ────────────
  { href: '/dashboard/ai', label: 'Deal Autopilot', icon: '✨', minRole: 'broker', group: 'AI Autopilot', core: true, keywords: 'ai automation workflow cockpit intelligence network trust evidence engagement' },
  // ── DEALS & LISTINGS ──────────────────────────────────────
  { href: '/pipeline', label: 'Deal Pipeline', icon: '🔄', minRole: 'broker', group: 'Deals & Listings', core: true, keywords: 'kanban stages deals funnel buyers conversion' },
  { href: '/listings', label: 'Listings', icon: '🏢', minRole: 'agent', group: 'Deals & Listings', core: true, keywords: 'businesses inventory' },
  { href: '/dashboard/studio', label: 'Deal Studio', icon: '✨', minRole: 'agent', group: 'Deals & Listings', core: true, keywords: 'ai studio listing capture verify publish sell' },
  { href: '/dashboard/listings/new', label: 'New Listing', icon: '➕', minRole: 'agent', group: 'Deals & Listings', core: true, keywords: 'create wizard add' },
  { href: '/leads', label: 'Lead Management', icon: '🎯', minRole: 'agent', group: 'Deals & Listings', core: true, keywords: 'buyers contacts prospects sellers outreach' },

  { href: '/dashboard/deal-terms', label: 'Deal Terms', icon: '🤝', minRole: 'broker', group: 'Deals & Listings', keywords: 'offer lab loi negotiation letter of intent terms structure counter' },
  { href: '/dashboard/deal-docs', label: 'Deal Docs', icon: '📄', minRole: 'agent', group: 'Deals & Listings', keywords: 'nda non disclosure confidentiality buyer qualify listing agreement exclusive sign approve requests' },
  { href: '/dashboard/closing', label: 'Closing Tracker', icon: '🏁', minRole: 'broker', group: 'Deals & Listings', keywords: 'escrow closing checklist' },

  { href: '/dashboard/valuation', label: 'Valuation', icon: '📐', minRole: 'broker', group: 'Deals & Listings', keywords: 'value worth pricing comps comparables multiples sellable reports client' },

  { href: '/dashboard/off-market', label: 'Off-Market Room', icon: '🔐', minRole: 'agent', group: 'Deals & Listings', keywords: 'private deals verified buyers exclusive' },

  { href: '/dashboard/listing-advisor', label: 'Listing Advisor', icon: '🩺', minRole: 'broker', group: 'Deals & Listings', keywords: 'advisor worth value listable cim questions seller readiness funnel blockers prepare' },
  { href: '/dashboard/expiry', label: 'Listing Expiry', icon: '⏳', minRole: 'broker', group: 'Deals & Listings', keywords: 'expiring renewals' },
  // ── CLIENTS & DOCS ────────────────────────────────────────
  { href: '/dashboard/portal', label: 'Client Portal', icon: '👥', minRole: 'broker', group: 'Clients & Docs', keywords: 'client access login' },
  { href: '/dashboard/watchlist', label: 'Deal Alerts', icon: '🔔', minRole: 'agent', group: 'Clients & Docs', keywords: 'watch saved alerts' },
  { href: '/dashboard/network', label: 'Network', icon: '🤝', minRole: 'broker', group: 'Clients & Docs', keywords: 'professionals attorneys cpas lenders referrals refer partner' },
  { href: '/dashboard/search', label: 'Search', icon: '🔍', minRole: 'agent', group: 'Clients & Docs', keywords: 'find global' },
  { href: '/documents', label: 'Documents', icon: '📁', minRole: 'agent', group: 'Clients & Docs', core: true, keywords: 'files folder' },
  { href: '/dashboard/reports', label: 'Reports & Diligence', icon: '📑', minRole: 'broker', group: 'Clients & Docs', keywords: 'recast adjusted earnings sde cim confidential information memorandum bov broker opinion value due diligence checklist review' },
  { href: '/dashboard/financial-files', label: 'Financial Files', icon: '🗂️', minRole: 'broker', group: 'Clients & Docs', keywords: 'financials statements tax' },
  // ── MARKETING & GROWTH ────────────────────────────────────
  { href: '/dashboard/marketing', label: 'Marketing', icon: '🖨️', minRole: 'broker', group: 'Marketing & Growth', core: true, keywords: 'campaigns ads social facebook instagram newspaper blog nurture drips syndication email templates store' },
  // ── TEAM & OFFICE ─────────────────────────────────────────
  { href: '/dashboard/calendar', label: 'Calendar', icon: '📅', minRole: 'agent', group: 'Team & Office', core: true, keywords: 'schedule meetings calls phone reminders call-backs follow up tasks' },
  { href: '/dashboard/communications', label: 'Communications', icon: '🗒️', minRole: 'agent', group: 'Team & Office', core: true, keywords: 'inbox messages' },

  { href: '/dashboard/training', label: 'Training', icon: '🎓', minRole: 'agent', group: 'Team & Office', core: true, keywords: 'courses cbi learn' },
  { href: '/dashboard/agents', label: 'AI Agents', icon: '🤖', minRole: 'broker', group: 'AI Autopilot', keywords: 'ai agents assistant chat lead training document support' },
  { href: '/dashboard/team', label: 'Team', icon: '🤝', minRole: 'admin', group: 'Team & Office', keywords: 'hiring recruiting jobs offer letters onboarding new hire setup checklist' },
  // ── ADMIN ─────────────────────────────────────────────────
  { href: '/dashboard/finance', label: 'Finance', icon: '💰', minRole: 'admin', group: 'Admin', keywords: 'commissions payouts splits expenses ledger costs' },
  { href: '/dashboard/review-queue', label: 'Review Queue', icon: '🗂️', minRole: 'admin', group: 'Admin', keywords: 'moderation approval' },
  { href: '/dashboard/tools', label: 'CSV Tools', icon: '🧰', minRole: 'broker', group: 'Admin', keywords: 'import export csv' },
  { href: '/dashboard/security', label: 'Security', icon: '🛂', minRole: 'admin', group: 'Admin', keywords: '2fa login access' },
  { href: '/dashboard/passwords', label: 'Password Vault', icon: '🔑', minRole: 'agent', group: 'Admin', keywords: 'credentials secrets' },
  { href: '/agencies', label: 'Agency Admin', icon: '🏛️', minRole: 'admin', group: 'Admin', keywords: 'agency manage' },
  { href: '/billing', label: 'Billing', icon: '💳', minRole: 'admin', group: 'Admin', keywords: 'invoice payment plan' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️', minRole: 'admin', group: 'Admin', keywords: 'preferences profile' },
]

export const roleRank: Record<NavRole, number> = { agent: 0, broker: 1, admin: 2 }

/** Items visible to a given role. */
export function navForRole(role: NavRole): NavItem[] {
  return NAV.filter((item) => roleRank[item.minRole] <= roleRank[role])
}
