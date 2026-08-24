'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'

interface Template {
  id: string
  name: string
  category: string
  subject: string
  body: string
  variables: { name: string; label: string }[]
  is_system: boolean
}

const CATEGORIES = ['intro', 'nda', 'offer', 'counter', 'welcome', 'valuation', 'follow_up', 'general']

export default function EmailTemplatesPage() {
  return (
    <AppShell active="Email Templates">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <EmailTemplates />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function EmailTemplates() {
  const toast = useToast()
  const [templates, setTemplates] = useState<Template[]>([])
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Template | null>(null)
  const [form, setForm] = useState({ name: '', category: 'general', subject: '', body: '' })
  const [vars, setVars] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (agency: string) => {
    setLoading(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch(`/api/email-templates?agencyId=${agency}`, { headers: { authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    setTemplates(data.templates || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      await load(ctx.agencyId)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seed = async () => {
    const token = localStorage.getItem('sb-access-token') || ''
    await fetch('/api/email-templates', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'seed' }),
    })
    toast('Standard library loaded', 'success')
    if (agencyId) await load(agencyId)
  }

  const open = (t: Template) => {
    setSelected(t)
    setForm({ name: t.name, category: t.category, subject: t.subject, body: t.body })
    const initial: Record<string, string> = {}
    for (const v of t.variables || []) initial[v.name] = ''
    setVars(initial)
  }

  const save = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast('Name, subject, and body are required', 'error')
      return
    }
    setBusy(true)
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/email-templates', {
      method: selected ? 'PATCH' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: selected?.id || null, ...form }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Save failed', 'error')
    toast('Template saved', 'success')
    setSelected(null)
    if (agencyId) await load(agencyId)
  }

  const remove = async (t: Template) => {
    if (t.is_system) return toast('System templates cannot be deleted', 'error')
    const token = localStorage.getItem('sb-access-token') || ''
    const res = await fetch('/api/email-templates', {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: t.id }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) return toast(data.error || 'Delete failed', 'error')
    toast('Deleted', 'success')
    if (agencyId) await load(agencyId)
  }

  const previewSubject = (selected?.subject || form.subject).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars && vars[k] ? vars[k] : m))
  const previewBody = (selected?.body || form.body).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars && vars[k] ? vars[k] : m))

  const sendTest = async () => {
    const to = (window.localStorage.getItem('concord_broker_email') || '').trim()
    if (!to || !to.includes('@')) {
      toast('No broker email on file — set it in Settings first', 'error')
      return
    }
    if (!previewSubject.trim() || !previewBody.trim()) {
      toast('Subject and body are required', 'error')
      return
    }
    setBusy(true)
    try {
      const { authenticatedFetch } = await import('@/lib/authenticatedFetch')
      const res = await authenticatedFetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: previewSubject,
          html: `<p>${previewBody.replace(/\n/g, '<br/>')}</p>`,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || 'Send failed')
      toast(data.queued ? 'Test queued for delivery 📧' : 'Test sent 📧', 'success')
    } catch (e) {
      toast('Send failed: ' + (e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !templates.length) return <LoadingState />

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">✉️ Email Template Library</h1>
          <p className="text-gray-500 text-sm mt-1">One-click professional emails — {'{{variable}}'} placeholders fill in per recipient.</p>
        </div>
        <button onClick={seed} className="text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg">
          ↺ Restore standard library
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Template list */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Templates</h2>
          {templates.length === 0 ? (
            <p className="text-gray-400 text-sm">No templates yet. Click "Restore standard library" to load the defaults.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {templates.map((t) => (
                <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <button onClick={() => open(t)} className="text-left min-w-0">
                    <p className="text-sm font-medium hover:text-blue-600 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.subject}</p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{t.category}</span>
                    {!t.is_system && (
                      <button onClick={() => remove(t)} className="text-xs text-red-500 hover:underline">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => { setSelected(null); setForm({ name: '', category: 'general', subject: '', body: '' }); setVars({}) }}
            className="mt-4 w-full border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 text-sm font-medium py-2 rounded-lg"
          >
            + New template
          </button>
        </div>

        {/* Editor + preview */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">{selected ? `Edit: ${selected.name}` : 'New template'}</h2>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Template name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <input className="border rounded-lg px-3 py-2 text-sm w-full mb-2" placeholder="Subject — use {{variables}}" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea className="border rounded-lg px-3 py-2 text-sm w-full h-36 mb-2" placeholder="Body — use {{recipient_name}}, {{business_name}}, {{agent_name}}…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />

          {(selected?.variables?.length || 0) > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 mb-1">Preview values:</p>
              <div className="grid grid-cols-2 gap-2">
                {(selected?.variables || []).map((v) => (
                  <input key={v.name} className="border rounded-lg px-2 py-1.5 text-xs" placeholder={v.label} value={vars[v.name] || ''} onChange={(e) => setVars({ ...vars, [v.name]: e.target.value })} />
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-gray-700">{previewSubject}</p>
            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{previewBody}</p>
          </div>

          <button onClick={save} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg">
            {busy ? 'Saving…' : selected ? 'Save changes' : 'Create template'}
          </button>
          <button
            onClick={sendTest}
            disabled={busy}
            className="w-full mt-2 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium py-2 rounded-lg"
          >
            📧 Send test to my email
          </button>
        </div>
      </div>
    </div>
  )
}
