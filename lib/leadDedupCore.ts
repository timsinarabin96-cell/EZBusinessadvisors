/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// leadDedupCore — pure, dependency-free duplicate-lead detection.
// Normalizes emails / phones / names, then groups leads that share a contact
// key (union-find so a lead connected via email to one and phone to another
// still lands in one group). Also finds cross-kind matches: the same person
// appearing as BOTH a buyer and a seller lead — gold for a broker.
// =============================================================================

export interface DedupLead {
  kind: 'buyer' | 'seller'
  id: string
  email: string | null
  phone: string | null
  business_name?: string | null
  created_at?: string | null
  notes?: string | null
  status?: string | null
  source?: string | null
}

export const normalizeEmail = (e?: string | null): string =>
  (e || '').trim().toLowerCase().replace(/\s+/g, '')

export const normalizePhone = (p?: string | null): string => {
  const d = (p || '').replace(/\D/g, '')
  // US: strip the leading country code when it is the only extra digit.
  if (d.length === 11 && d.startsWith('1')) return d.slice(1)
  return d
}

export const normalizeName = (n?: string | null): string =>
  (n || '').trim().toLowerCase().replace(/\s+/g, ' ')

export interface DupGroup {
  members: DedupLead[] // sorted oldest → newest by created_at
  sharedEmails: string[]
  sharedPhones: string[]
  reason: string // human summary, e.g. "same email + same phone"
}

const MIN_PHONE_LEN = 7 // ignore junk like "123" or "N/A"

export function findDuplicateGroups(leads: DedupLead[]): DupGroup[] {
  const n = leads.length
  if (n < 2) return []

  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const emailIdx = new Map<string, number[]>()
  const phoneIdx = new Map<string, number[]>()
  leads.forEach((l, i) => {
    const e = normalizeEmail(l.email)
    if (e) {
      const arr = emailIdx.get(e) || []
      arr.push(i)
      emailIdx.set(e, arr)
    }
    const p = normalizePhone(l.phone)
    if (p && p.length >= MIN_PHONE_LEN) {
      const arr = phoneIdx.get(p) || []
      arr.push(i)
      phoneIdx.set(p, arr)
    }
  })

  for (const idxs of emailIdx.values()) {
    if (idxs.length > 1) for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i])
  }
  for (const idxs of phoneIdx.values()) {
    if (idxs.length > 1) for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i])
  }

  const comps = new Map<number, number[]>()
  leads.forEach((_, i) => {
    const r = find(i)
    const arr = comps.get(r) || []
    arr.push(i)
    comps.set(r, arr)
  })

  const groups: DupGroup[] = []
  for (const idxs of comps.values()) {
    if (idxs.length < 2) continue
    const inComp = new Set(idxs)
    const members = idxs
      .map((i) => leads[i])
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return ta - tb
      })
    const sharedEmails = [...emailIdx.entries()]
      .filter(([, v]) => v.filter((i) => inComp.has(i)).length > 1)
      .map(([k]) => k)
    const sharedPhones = [...phoneIdx.entries()]
      .filter(([, v]) => v.filter((i) => inComp.has(i)).length > 1)
      .map(([k]) => k)
    const parts: string[] = []
    if (sharedEmails.length) parts.push('same email')
    if (sharedPhones.length) parts.push('same phone')
    groups.push({ members, sharedEmails, sharedPhones, reason: parts.join(' + ') || 'related' })
  }

  groups.sort((a, b) => b.members.length - a.members.length)
  return groups
}

export interface CrossKindPair {
  buyer: DedupLead
  seller: DedupLead
  via: 'email' | 'phone'
}

export function findCrossKindPairs(
  buyers: DedupLead[],
  sellers: DedupLead[]
): CrossKindPair[] {
  const sellerByEmail = new Map<string, DedupLead>()
  const sellerByPhone = new Map<string, DedupLead>()
  for (const s of sellers) {
    const e = normalizeEmail(s.email)
    if (e) sellerByEmail.set(e, s)
    const p = normalizePhone(s.phone)
    if (p && p.length >= MIN_PHONE_LEN) sellerByPhone.set(p, s)
  }

  const pairs: CrossKindPair[] = []
  const seen = new Set<string>()
  for (const b of buyers) {
    const e = normalizeEmail(b.email)
    if (e && sellerByEmail.has(e) && !seen.has(b.id)) {
      pairs.push({ buyer: b, seller: sellerByEmail.get(e)!, via: 'email' })
      seen.add(b.id)
    }
    const p = normalizePhone(b.phone)
    if (p && p.length >= MIN_PHONE_LEN && sellerByPhone.has(p) && !seen.has(b.id)) {
      pairs.push({ buyer: b, seller: sellerByPhone.get(p)!, via: 'phone' })
      seen.add(b.id)
    }
  }
  return pairs
}
