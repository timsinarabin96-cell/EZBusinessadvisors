'use client'

// ---------------------------------------------------------------------------
// /dashboard/financial-files — Broker financial folder: all financial and
// closing documents per deal/listing, shared across the team.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { Card, CardHeader, LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabase/client'

export default function FinancialFilesPage() {
  return (
    <AppShell active="Financial Files">
      <ToastProvider>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <FinancialFiles />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function FinancialFiles() {
  const toast = useToast()
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dealId, setDealId] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileType, setFileType] = useState('financial_statement')
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deals, setDeals] = useState<{ id: string; title: string | null }[]>([])

  const load = useCallback(async () => {
    const [f, d] = await Promise.all([
      supabase.from('broker_financial_files').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('deals').select('id, title').limit(30),
    ])
    setFiles(((f.data || [])) as any[])
    setDeals(((d.data || [])) as any[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingState label="Loading financial files…" />

  const chooseFile = async (file: File) => {
    if (!dealId) { toast('Select a deal first', 'info'); return }
    setUploading(true)
    try {
      const path = `financial-files/${dealId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) { toast('Upload failed — check the documents bucket', 'error'); setUploading(false); return }
      const url = supabase.storage.from('documents').getPublicUrl(path).data.publicUrl
      await supabase.from('broker_financial_files').insert({
        deal_id: dealId, file_name: file.name, file_url: url, file_type: fileType, notes: notes || null,
      })
      toast('Financial file uploaded')
      setFileName(''); setNotes(''); load()
    } catch { toast('Upload failed', 'error') }
    setUploading(false)
  }

  const dealTitle = (id: string) => deals.find((d) => d.id === id)?.title || id.slice(0, 8)

  return (
    <div>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--navy)', marginBottom: 6 }}>Broker Financial Files</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 20 }}>A shared folder of financial and closing documents, organized per deal.</p>

      <Card style={{ marginBottom: 20 }}>
        <CardHeader title="Upload financial file" subtitle="Tax returns, statements, closing detail" />
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr', gap: 12 }} className="wf-grid-3">
            <select value={dealId} onChange={(e) => setDealId(e.target.value)} style={fld}>
              <option value="">Select deal / listing…</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.title || 'Untitled deal'}</option>)}
            </select>
            <select value={fileType} onChange={(e) => setFileType(e.target.value)} style={fld}>
              <option value="financial_statement">Financial statement</option>
              <option value="tax_return">Tax return</option>
              <option value="closing_statement">Closing statement</option>
              <option value="purchase_agreement">Purchase agreement</option>
              <option value="other">Other</option>
            </select>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={fld} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ padding: '11px 18px', background: 'var(--navy)', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              {uploading ? 'Uploading…' : 'Choose file to upload'}
              <input type="file" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFileName(f.name); await chooseFile(f) } e.target.value = '' }} />
            </label>
            {fileName && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{fileName}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Financial files (${files.length})`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Georgia, serif', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                {['File', 'Deal', 'Type', 'Notes', 'Uploaded', 'Action'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {files.length === 0 && <tr><td colSpan={6} style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>No financial files yet — upload one above. (Run sql/workflow_schema.sql to enable.)</td></tr>}
              {files.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={td}><strong>{f.file_name}</strong></td>
                  <td style={td}>{dealTitle(f.deal_id)}</td>
                  <td style={td}><span style={{ textTransform: 'capitalize' }}>{f.file_type?.replace(/_/g, ' ')}</span></td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{f.notes || '—'}</td>
                  <td style={{ ...td, fontSize: 12.5, color: 'var(--muted)' }}>{f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : '—'}</td>
                  <td style={td}><a href={f.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontWeight: 600, fontSize: 13 }}>Open ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const th: React.CSSProperties = { padding: '12px 14px', fontWeight: 700, color: 'var(--navy)', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '14px', verticalAlign: 'middle' }
const fld: React.CSSProperties = { padding: '11px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 14, fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }
