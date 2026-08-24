'use client'

// ---------------------------------------------------------------------------
// /dashboard/blog — Insights/Blog management (audit Part C #1).
// Brokers publish, edit, unpublish, and delete articles that power the public
// /marketplace/insights SEO hub. DDL-free engine (platform_settings JSONB).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'

interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: string
  read: string
  date: string
  published: boolean
  sections: [string, string][]
  updated_at: string
}

const token = () => localStorage.getItem('sb-access-token') || ''
const authHeaders = () => ({ authorization: `Bearer ${token()}`, 'content-type': 'application/json' })

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function BlogPage() {
  return (
    <AppShell active="Blog & Insights">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <BlogManager />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function BlogManager() {
  const toast = useToast()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlogPost | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/blog?all=1', { headers: { authorization: `Bearer ${token()}` } })
    const data = await res.json().catch(() => ({}))
    setPosts(data.posts || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const togglePublish = async (p: BlogPost) => {
    await fetch('/api/blog', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        slug: p.slug, title: p.title, excerpt: p.excerpt, category: p.category,
        read: p.read, date: p.date, published: !p.published, sections: p.sections,
      }),
    })
    toast(!p.published ? 'Post published' : 'Post unpublished', 'success')
    load()
  }

  const remove = async (p: BlogPost) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return
    const res = await fetch(`/api/blog?slug=${encodeURIComponent(p.slug)}`, {
      method: 'DELETE', headers: { authorization: `Bearer ${token()}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to delete', 'error')
    toast('Post deleted', 'success')
    load()
  }

  const startNew = () => {
    setEditing({
      slug: '', title: '', excerpt: '', category: 'Insights', read: '5 min',
      date: new Date().toISOString().slice(0, 10), published: true, sections: [['', '']], updated_at: '',
    })
    setIsNew(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!editing) return
    const clean: BlogPost = {
      ...editing,
      title: editing.title.trim(),
      excerpt: editing.excerpt.trim(),
      category: editing.category.trim() || 'Insights',
      sections: editing.sections.filter(([h, b]) => h.trim() && b.trim()),
    }
    if (!clean.title) return toast('Title is required', 'error')
    if (clean.sections.length === 0) return toast('Add at least one section with heading + body', 'error')
    setBusy(true)
    const res = await fetch('/api/blog', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        slug: clean.slug || undefined, title: clean.title, excerpt: clean.excerpt,
        category: clean.category, read: clean.read, date: clean.date,
        published: clean.published, sections: clean.sections,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Failed to save', 'error')
    toast(isNew ? 'Post created' : 'Post updated', 'success')
    setEditing(null); setIsNew(false)
    load()
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>📝 Blog & Insights</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '6px 0 0', maxWidth: 620 }}>
            Publish articles to the public <strong>/marketplace/insights</strong> SEO hub — valuation guides, financing playbooks, and how-tos that bring in buyers and sellers.
          </p>
        </div>
        <button onClick={startNew} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg" style={{ border: 'none', cursor: 'pointer' }}>
          + New article
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: 22, marginBottom: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 14px' }}>{isNew ? 'New article' : `Edit: ${editing.title}`}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Title *
              <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Category
              <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </label>
          </div>
          <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', marginBottom: 12 }}>
            Excerpt (shown on the hub card)
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
              value={editing.excerpt} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Slug (optional)
              <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="auto-from-title" />
            </label>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Read time
              <input className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                value={editing.read} onChange={(e) => setEditing({ ...editing, read: e.target.value })} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>
              Date
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
            </label>
          </div>

          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>Sections (heading + body)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {editing.sections.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input
                  style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit' }}
                  placeholder="Section heading"
                  value={s[0]}
                  onChange={(e) => {
                    const next = [...editing.sections]; next[i] = [e.target.value, s[1]]; setEditing({ ...editing, sections: next })
                  }}
                />
                <textarea
                  rows={2}
                  style={{ flex: 2, border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="Body text…"
                  value={s[1]}
                  onChange={(e) => {
                    const next = [...editing.sections]; next[i] = [s[0], e.target.value]; setEditing({ ...editing, sections: next })
                  }}
                />
                <button onClick={() => setEditing({ ...editing, sections: editing.sections.filter((_, j) => j !== i) })}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#dc2626', padding: '8px' }}>✕</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setEditing({ ...editing, sections: [...editing.sections, ['', '']] })}
              style={{ background: 'transparent', border: '1px dashed var(--line)', color: 'var(--navy)', borderRadius: 8, padding: '8px 14px', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}
            >
              + Add section
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--muted)', marginLeft: 6 }}>
              <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} />
              Published (visible on public site)
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setEditing(null); setIsNew(false) }}
              style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={busy} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg" style={{ border: 'none', cursor: 'pointer' }}>
              {busy ? 'Saving…' : isNew ? 'Create article' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {posts.map((p) => (
          <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 18px' }}>
            <span style={{ fontSize: 20 }}>{p.published ? '📰' : '📝'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--navy)' }}>{p.title}</span>
                <span style={{ fontSize: 11, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 9px', color: 'var(--muted)' }}>{p.category}</span>
                {!p.published && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '1px 9px', fontWeight: 700 }}>Draft</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                {p.sections.length} sections · {p.read} · {fmtDate(p.date)} · updated {fmtDate(p.updated_at)}
              </div>
            </div>
            <a href={`/marketplace/insights/${p.slug}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#0e7490', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>View ↗</a>
            <button onClick={() => { setEditing(p); setIsNew(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
            <button onClick={() => togglePublish(p)}
              style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: p.published ? '#92400e' : '#15803d' }}>
              {p.published ? 'Unpublish' : 'Publish'}
            </button>
            <button onClick={() => remove(p)}
              style={{ background: 'transparent', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontWeight: 600, color: '#dc2626' }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
