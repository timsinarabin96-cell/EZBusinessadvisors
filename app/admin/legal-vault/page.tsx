/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// /admin/legal-vault — admin-only legal & security document vault.
// Every "save my ass" document in one place: security checklist, ownership,
// broker compliance, incident response, insurance, filings tracker.
// PLATFORM ADMIN ONLY — the API route enforces it AND row-level security
// blocks non-admin rows at the database level.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { LoadingState } from '@/components/ui'

interface VaultDoc {
  id: string
  slug: string
  title: string
  category: string
  version: string
  body_md?: string
  updated_at: string
}

// Minimal, safe markdown renderer (headers, bold, lists, tables, paragraphs).
// Content is admin-authored only; still escapes HTML defensively.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f4f1e8;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
}

function renderMarkdown(md: string): string {
  const lines = md.split('\n')
  let html = ''
  let inList = false
  let inTable = false

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      if (inList) { html += '</ul>'; inList = false }
      if (inTable) { html += '</table>'; inTable = false }
      continue
    }
    // Table row
    if (line.startsWith('|')) {
      const cells = line.split('|').filter((c) => c.trim() !== '---' && c.trim() !== '').map((c) => c.trim())
      const isHeader = cells.every((c) => /^[A-Za-z ]+$/.test(c)) && !inTable
      if (!inTable) {
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">'
        html += '<thead><tr>' + cells.map((c) => `<th style="border:1px solid #ddd;padding:6px 10px;text-align:left;background:#faf7ee">${renderInline(c)}</th>`).join('') + '</tr></thead><tbody>'
        inTable = true
      } else {
        html += `<tr>${cells.map((c) => `<td style="border:1px solid #eee;padding:6px 10px">${renderInline(c)}</td>`).join('')}</tr>`
      }
      continue
    }
    if (inTable) { html += '</tbody></table>'; inTable = false }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      if (inList) { html += '</ul>'; inList = false }
      const level = h[1].length
      html += `<h${level} style="margin:18px 0 8px;color:#1a1a2e">${renderInline(h[2])}</h${level}>`
      continue
    }
    // Checkbox bullets (must be tested BEFORE plain bullets)
    const cb = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i)
    if (cb) {
      if (!inList) { html += '<ul style="margin:8px 0;padding-left:22px">'; inList = true }
      const checked = cb[1].toLowerCase() === 'x'
      html += `<li style="margin:3px 0">${checked ? '☑️' : '⬜'} ${renderInline(cb[2])}</li>`
      continue
    }
    // Bullets
    const b = line.match(/^\s*[-*]\s+(.*)$/)
    if (b) {
      if (!inList) { html += '<ul style="margin:8px 0;padding-left:22px">'; inList = true }
      html += `<li style="margin:3px 0">${renderInline(b[1])}</li>`
      continue
    }
    // Paragraph
    if (inList) { html += '</ul>'; inList = false }
    html += `<p style="margin:8px 0;line-height:1.6">${renderInline(line)}</p>`
  }
  if (inList) html += '</ul>'
  if (inTable) html += '</tbody></table>'
  return html
}

const CATEGORY_COLORS: Record<string, string> = {
  Security: '#0f766e',
  Compliance: '#7c3aed',
  Ownership: '#b45309',
  Risk: '#b91c1c',
  Legal: '#1d4ed8',
}

export default function AdminLegalVaultPage() {
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [active, setActive] = useState<VaultDoc | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingDoc, setLoadingDoc] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await authenticatedFetch('/api/admin/legal-vault')
        const j = await res.json()
        if (!res.ok || !j.ok) setError(j.error || 'Access denied — platform admin only.')
        else setDocs(j.docs || [])
      } catch {
        setError('Failed to load legal vault.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const openDoc = useCallback(async (d: VaultDoc) => {
    setActive(d)
    if (d.body_md) return
    setLoadingDoc(true)
    try {
      const res = await authenticatedFetch(`/api/admin/legal-vault?slug=${encodeURIComponent(d.slug)}`)
      const j = await res.json()
      if (j.ok && j.doc) setActive(j.doc)
    } catch {
      /* keep list-only view */
    } finally {
      setLoadingDoc(false)
    }
  }, [])

  const categories = Array.from(new Set(docs.map((d) => d.category)))

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>⚖️ Legal Vault</div>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Admin-only. Every legal &amp; security document that protects the platform — RLS-locked to platform admins.
          </div>
        </div>
        {active && (
          <button
            onClick={() => window.print()}
            style={{ background: '#1a1a2e', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            🖨️ Print
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '16px 20px', borderRadius: 10 }}>{error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: active ? '280px 1fr' : '1fr', gap: 20 }}>
          {/* Document list */}
          <div>
            {categories.map((cat) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: CATEGORY_COLORS[cat] || '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  {cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {docs.filter((d) => d.category === cat).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openDoc(d)}
                      style={{
                        textAlign: 'left', border: active?.id === d.id ? '2px solid #1a1a2e' : '1px solid #ece8dc',
                        background: active?.id === d.id ? '#faf7ee' : '#fff', borderRadius: 10, padding: '10px 14px',
                        cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#1a1a2e', fontFamily: 'inherit',
                      }}
                    >
                      {d.title}
                      <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginTop: 3 }}>
                        v{d.version} · {new Date(d.updated_at).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Document viewer */}
          {active && (
            <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 14, padding: '24px 28px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', marginBottom: 2 }}>{active.title}</div>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 14 }}>
                {active.category} · v{active.version} · Updated {new Date(active.updated_at).toLocaleString()}
              </div>
              {loadingDoc ? (
                <LoadingState />
              ) : (
                <div
                  style={{ color: '#333', fontSize: 14 }}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(active.body_md || '') }}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>
        🔒 This vault is protected two ways: the API route requires platform-admin auth, and Supabase row-level security
        blocks every non-admin profile from reading these rows. Not legal advice — keep counsel informed of material changes.
      </div>
    </div>
  )
}
