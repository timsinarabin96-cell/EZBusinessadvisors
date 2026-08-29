/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { fetchTemplates, type DocumentTemplate, type TemplateField, type TemplateParty, type FieldType } from '@/lib/documentBuilder'
import { getAgencyContext } from '@/lib/agencyContext'
import AiTemplateImport from '@/components/documents/AiTemplateImport'

// =============================================================================
// Template Manager — agency-owned legal document templates.
// Any brokerage using the platform can load their OWN legal documents (pasted
// body text with {{placeholder}} tokens) and run them through the exact same
// Deal Docs & eSign workflow (generate per listing → fill → sign → audit).
// System templates (created_by = null) are read-only; agency templates are
// editable/deletable by the agency that created them.
// =============================================================================

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'textarea']

const CATEGORIES = [
  'Marketing Agreement',
  'Listing Agreement',
  'Corporate Documents',
  'Seller Documents',
  'Buyer Documents',
  'NDA',
  'Purchase Agreement',
  'Other',
]

const emptyField = (): TemplateField => ({ key: '', label: '', type: 'text', required: false, placeholder: '' })
const emptyParty = (): TemplateParty => ({ key: '', label: '', role: 'custom' })

export default function TemplateManager() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<DocumentTemplate | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [agencyId, setAgencyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [user, ctx] = await Promise.all([
        supabase.auth.getUser(),
        getAgencyContext(),
      ])
      const agency = ctx?.agencyId ?? null
      setMe(user.data.user?.id ?? null)
      setAgencyId(agency)
      const tpls = await fetchTemplates(false, agency)
      setTemplates(tpls)
    } catch (e) {
      setError((e as Error).message || 'Failed to load templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Agency templates are manageable by ANY member of the owning agency
  // (white-label: the sold CRM's team owns their docs, not just the uploader).
  const isMine = (t: DocumentTemplate) =>
    (t.created_by != null && t.created_by === me) ||
    (!!agencyId && (t as any).agency_id === agencyId)
  const save = async (tpl: DocumentTemplate) => {
    setError('')
    try {
      const payload = {
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        fields: tpl.fields,
        parties: tpl.parties,
        body_template: tpl.body_template,
        is_active: tpl.is_active,
      }
      if (isMine(tpl) && tpl.id) {
        const { error } = await supabase.from('document_templates').update(payload).eq('id', tpl.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('document_templates').insert({ ...payload, created_by: me })
        if (error) throw error
      }
      setEditing(null)
      await load()
    } catch (e) {
      setError((e as Error).message || 'Failed to save template')
    }
  }

  const remove = async (tpl: DocumentTemplate) => {
    if (!isMine(tpl) || !tpl.id) return
    if (!confirm(`Delete template "${tpl.name}"? Existing generated documents are kept.`)) return
    const { error } = await supabase.from('document_templates').delete().eq('id', tpl.id)
    if (error) { setError(error.message || 'Failed to delete'); return }
    setEditing(null)
    await load()
  }

  const toggleActive = async (tpl: DocumentTemplate) => {
    if (!tpl.id) return
    const { error } = await supabase.from('document_templates').update({ is_active: !tpl.is_active }).eq('id', tpl.id)
    if (error) { setError(error.message || 'Failed to update'); return }
    await load()
  }

  const patch = (patch: Partial<DocumentTemplate>) => {
    if (!editing) return
    setEditing({ ...editing, ...patch })
  }

  const patchField = (i: number, p: Partial<TemplateField>) => {
    if (!editing) return
    const fields = editing.fields.map((f, idx) => (idx === i ? { ...f, ...p } : f))
    patch({ fields })
  }

  const patchParty = (i: number, p: Partial<TemplateParty>) => {
    if (!editing) return
    const parties = editing.parties.map((pr, idx) => (idx === i ? { ...pr, ...p } : pr))
    patch({ parties })
  }

  // --- Render ----------------------------------------------------------------

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading templates…</div>

  const systemTpls = templates.filter((t) => t.created_by == null)
  const mineTpls = templates.filter((t) => isMine(t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* AI import — upload YOUR original document and AI makes it fillable. */}
      <AiTemplateImport agencyId={agencyId} onSaved={load} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>🗂️ Legal Template Manager</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Load your brokerage's own legal documents — paste the body with <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>{'{{field}}'}</code> tokens, define the fill fields + signature slots, and they run through the same Deal Docs &amp; eSign workflow.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setEditing({
            id: '', name: '', description: '', category: 'Other', fields: [emptyField()], parties: [emptyParty()], body_template: '', is_active: true, created_by: me,
          })}
        >
          + New Template
        </button>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fdecea', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

      {editing && <TemplateEditor tpl={editing} isMine={isMine(editing)} onPatch={patch} onPatchField={patchField} onPatchParty={patchParty} onSave={() => save(editing)} onDelete={() => remove(editing)} onCancel={() => setEditing(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <TemplateList title="🏛️ Your agency templates" templates={mineTpls} onEdit={(t) => setEditing({ ...t, fields: [...t.fields], parties: [...t.parties] })} onDelete={remove} onToggle={toggleActive} canManage />
        <TemplateList title="📜 System templates (built-in)" templates={systemTpls} onEdit={(t) => setEditing({ ...t, fields: [...t.fields], parties: [...t.parties] })} canManage={false} />
      </div>
    </div>
  )
}

function TemplateList({
  title, templates, onEdit, onDelete, onToggle, canManage,
}: {
  title: string
  templates: DocumentTemplate[]
  onEdit: (t: DocumentTemplate) => void
  onDelete?: (t: DocumentTemplate) => void
  onToggle?: (t: DocumentTemplate) => void
  canManage: boolean
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: '#faf9f4', fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>
        {title} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({templates.length})</span>
      </div>
      {templates.length === 0 ? (
        <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>
          {canManage ? 'None yet — click "+ New Template" to load your own legal documents.' : 'No system templates loaded.'}
        </div>
      ) : (
        templates.map((t) => (
          <div key={t.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, opacity: t.is_active ? 1 : 0.35 }}>📄</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--navy)' }}>{t.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {t.category || 'Uncategorized'} · {t.fields?.length || 0} fields · {t.parties?.length || 0} signature slots
                {!t.is_active && ' · <span style="color:#b91c1c">disabled</span>'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {canManage && onToggle && (
                <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => onToggle(t)}>
                  {t.is_active ? 'Disable' : 'Enable'}
                </button>
              )}
              <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => onEdit(t)}>✏️ Edit</button>
              {canManage && onDelete && (
                <button className="btn" style={{ padding: '3px 10px', fontSize: 11.5, color: '#b91c1c' }} onClick={() => onDelete(t)}>🗑️</button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function TemplateEditor({
  tpl, isMine, onPatch, onPatchField, onPatchParty, onSave, onDelete, onCancel,
}: {
  tpl: DocumentTemplate
  isMine: boolean
  onPatch: (p: Partial<DocumentTemplate>) => void
  onPatchField: (i: number, p: Partial<TemplateField>) => void
  onPatchParty: (i: number, p: Partial<TemplateParty>) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const fieldTokens = tpl.fields.map((f) => f.key).filter(Boolean)
  const addField = () => onPatch({ fields: [...tpl.fields, emptyField()] })
  const addParty = () => onPatch({ parties: [...tpl.parties, emptyParty()] })
  const insertToken = (key: string) => {
    onPatch({ body_template: (tpl.body_template || '') + `{{${key}}}` })
  }

  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--navy)', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>{isMine ? '✏️ Edit template' : '👀 View template (system)'}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          {isMine && <button className="btn" style={{ color: '#b91c1c' }} onClick={onDelete}>Delete</button>}
          <button className="btn btn-primary" onClick={onSave}>💾 Save Template</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Template name *
          <input style={inputStyle} value={tpl.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="e.g. EZ Marketing Agreement 2026" />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Category
          <select style={inputStyle} value={tpl.category || ''} onChange={(e) => onPatch({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Short description
          <input style={inputStyle} value={tpl.description || ''} onChange={(e) => onPatch({ description: e.target.value })} placeholder="What is this form for?" />
        </label>
      </div>

      {/* Fields */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Fill fields <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— these become the {'{{tokens}}'} in your document body</span></div>
          <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addField}>+ Add field</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tpl.fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, width: 150 }} placeholder="key (no spaces)" value={f.key} onChange={(e) => onPatchField(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
              <input style={{ ...inputStyle, width: 180 }} placeholder="Label shown to user" value={f.label} onChange={(e) => onPatchField(i, { label: e.target.value })} />
              <select style={{ ...inputStyle, width: 110 }} value={f.type} onChange={(e) => onPatchField(i, { type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {f.type === 'select' && (
                <input style={{ ...inputStyle, width: 200 }} placeholder="Options, comma-separated" value={(f.options || []).join(', ')} onChange={(e) => onPatchField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
              )}
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={!!f.required} onChange={(e) => onPatchField(i, { required: e.target.checked })} /> required
              </label>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 11, color: '#b91c1c' }} onClick={() => onPatch({ fields: tpl.fields.filter((_, idx) => idx !== i) })}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Signature slots */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Signature slots <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— each gets its own sign box (add as many owners as you need)</span></div>
          <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addParty}>+ Add owner / signer</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tpl.parties.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...inputStyle, width: 140 }} placeholder="key (e.g. seller1)" value={p.key} onChange={(e) => onPatchParty(i, { key: e.target.value.replace(/[^a-z0-9_]/gi, '') })} />
              <input style={{ ...inputStyle, width: 180 }} placeholder="Label (e.g. Owner 2)" value={p.label} onChange={(e) => onPatchParty(i, { label: e.target.value })} />
              <select style={{ ...inputStyle, width: 110 }} value={p.role} onChange={(e) => onPatchParty(i, { role: e.target.value as TemplateParty['role'] })}>
                <option value="agent">Agent</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
                <option value="custom">Custom</option>
              </select>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 11, color: '#b91c1c' }} onClick={() => onPatch({ parties: tpl.parties.filter((_, idx) => idx !== i) })}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>Document body <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— paste your legal form text; tokens auto-fill from the listing</span></div>
        {fieldTokens.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {fieldTokens.map((k) => (
              <button key={k} style={{ padding: '2px 8px', borderRadius: 99, border: '1px solid var(--line)', background: '#f1f5f9', fontSize: 11, cursor: 'pointer', color: '#0f172a' }} onClick={() => insertToken(k)}>
                {'{{'}{k}{'}}'}
              </button>
            ))}
          </div>
        )}
        <textarea
          style={{ ...inputStyle, width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.55 }}
          value={tpl.body_template || ''}
          onChange={(e) => onPatch({ body_template: e.target.value })}
          placeholder={'MARKETING AGREEMENT\n\nEffective Date: {{effective_date}}\n\nCommission Rate: {{commission_rate}}%\nTerm: {{term_months}} months\n\nEach Owner executing below confirms their authority to bind the Seller...\n\nIN WITNESS WHEREOF, the parties have executed this Agreement.\n\nSignature: ______________________\nDate: ______________________'}
        />
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 8,
  border: '1px solid var(--line, #d8d4c8)',
  background: '#fff',
  fontSize: 13,
  color: '#0f172a',
  outline: 'none',
}
