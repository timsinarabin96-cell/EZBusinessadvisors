'use client'

// =============================================================================
// /dashboard/financial-files — Financial Files Dashboard.
// -----------------------------------------------------------------------------
// Lists all financial files per deal/listing with file-type badges (PDF, Excel,
// Word, Image), category auto-tags, upload date/time, size, uploader, delete
// (with confirmation, owner-scoped by RLS), download, and preview. Includes the
// multi-file dropzone and smart workflow buttons.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { Card, CardHeader, LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import MultiFileDropzone from '@/components/financial/MultiFileDropzone'
import { FilePreviewModal, FileTypeBadge, CategoryBadge, WorkflowButtons } from '@/components/financial/FilesUI'
import {
  FinancialDoc, formatBytes, fetchFinancialFiles, fetchDealOptions,
  deleteFinancialFile, updateFinancialStatus, getUserId,
  FinancialStatus, FILE_ICON,
} from '@/lib/financialFiles'

export default function FinancialFilesPage() {
  return (
    <AppShell active="Financial Files">
      <ToastProvider>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FinancialFilesDashboard />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function FinancialFilesDashboard() {
  const toast = useToast()
  const [files, setFiles] = useState<FinancialDoc[]>([])
  const [deals, setDeals] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FinancialDoc | null>(null)
  const [preview, setPreview] = useState<(FinancialDoc & { file_kind: any }) | null>(null)
  const [selectedParent, setSelectedParent] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, d, u] = await Promise.all([
        fetchFinancialFiles(),
        fetchDealOptions(),
        getUserId(),
      ])
      setFiles(f)
      setDeals(d)
      setUserId(u)
      // Best-effort admin detection (RLS still enforces the real gate)
      const { data: prof } = await (await import('@/lib/supabase/client')).supabase
        .from('profiles').select('role').eq('id', u || 'none').maybeSingle()
      setIsAdmin(prof?.role === 'broker' || prof?.role === 'admin')
    } catch (e: any) {
      toast(e?.message || 'Failed to load financial files', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const dealTitle = useMemo(() => {
    const m = new Map(deals.map((d) => [d.id, d.title]))
    return (id: string | null) => (id && m.get(id)) || (id ? id.slice(0, 8) : '—')
  }, [deals])

  const filtered = useMemo(() => {
    let list = files
    if (selectedParent) list = list.filter((f) => f.deal_id === selectedParent || f.listing_id === selectedParent)
    if (statusFilter) list = list.filter((f) => f.status === statusFilter)
    return list
  }, [files, selectedParent, statusFilter])

  const totals = useMemo(() => {
    const bytes = files.reduce((s, f) => s + (f.file_size || 0), 0)
    const byStatus: Record<string, number> = {}
    for (const f of files) byStatus[f.status] = (byStatus[f.status] || 0) + 1
    return {
      count: files.length,
      size: formatBytes(bytes),
      recastDone: byStatus.recast_done || 0,
      bovDone: byStatus.bov_done || 0,
      cimDone: byStatus.cim_done || 0,
      pending: byStatus.pending || 0,
    }
  }, [files])

  const onDelete = async (doc: FinancialDoc) => {
    setDeleting(doc.id)
    const res = await deleteFinancialFile(doc)
    setDeleting(null)
    setConfirmDelete(null)
    if (res.success) {
      toast('File deleted')
      load()
    } else {
      toast(res.error || 'Delete failed — you may only delete files you uploaded', 'error')
    }
  }

  const onStatusChange = async (doc: FinancialDoc, status: FinancialStatus) => {
    const ok = await updateFinancialStatus(doc.id, status)
    if (ok) { toast('Status updated'); load() }
    else toast('Could not update status', 'error')
  }

  if (loading) return <LoadingState label="Loading financial files…" />

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 27, color: 'var(--navy)', margin: 0 }}>Financial Files</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 14 }}>Tax returns, statements, and generated documents — organized per deal.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '18px 0' }}>
        {[
          { label: 'Total Files', value: String(totals.count), color: 'var(--navy)' },
          { label: 'Total Size', value: totals.size, color: 'var(--gold-dark)' },
          { label: 'Pending', value: String(totals.pending), color: '#7a7a8a' },
          { label: 'Recast Done', value: String(totals.recastDone), color: '#a8872f' },
          { label: 'BOV Done', value: String(totals.bovDone), color: '#0e7490' },
          { label: 'CIM Done', value: String(totals.cimDone), color: '#16a34a' },
        ].map((k) => (
          <div key={k.label} className="kpi" style={{ background: 'var(--cream)', border: '1px solid var(--line)', borderLeft: `4px solid ${k.color}`, borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--gold-dark)', fontWeight: 700, fontFamily: 'Georgia, serif' }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color, fontFamily: 'Georgia, serif', marginTop: 2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Upload card */}
      <Card style={{ marginBottom: 22 }}>
        <CardHeader title="Upload financial documents" subtitle="Drag & drop multiple files — they're auto-tagged by type" />
        <div style={{ padding: 18 }}>
          <MultiFileDropzone
            parentId={selectedParent || 'general'}
            dealId={selectedParent || null}
            listingId={null}
            onUploaded={() => { load(); toast('Files uploaded', 'success') }}
          />
        </div>
      </Card>

      {/* Smart workflow buttons */}
      <Card style={{ marginBottom: 22 }}>
        <CardHeader title="Smart workflows" subtitle="Run these on the selected deal after uploading files" />
        <div style={{ padding: 18 }}>
          <WorkflowButtons dealId={selectedParent || null} listingId={null} />
        </div>
      </Card>

      {/* File list card */}
      <Card>
        <CardHeader
          title={`Financial files (${filtered.length})`}
          subtitle={selectedParent ? `Filtered: ${dealTitle(selectedParent)}` : 'All deals'}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedParent}
                onChange={(e) => setSelectedParent(e.target.value)}
                className="select"
                style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit' }}
              >
                <option value="">All deals / listings</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="select"
                style={{ padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--line)', fontFamily: 'inherit' }}
              >
                <option value="">All statuses</option>
                {(['pending', 'processed', 'recast_done', 'bov_done', 'cim_done'] as FinancialStatus[]).map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          }
        />

        <div style={{ padding: '4px 18px 18px', overflowX: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 34, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Georgia, serif' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🗂️</div>
              No financial files yet. Upload documents above — they'll appear here with auto-detected tags.
              <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>Run sql/financial_files_schema.sql in Supabase to enable (if not yet applied).</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Georgia, serif', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--gold-dark)', textAlign: 'left' }}>
                  {['File', 'Deal', 'Category', 'Status', 'Size', 'Uploaded By', 'Date', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--navy)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const kind = f.file_kind as any
                  const canDelete = isAdmin || !userId || f.uploaded_by === userId
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      {/* File */}
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, maxWidth: 260 }}>
                          <span style={{ fontSize: 20 }}>{FILE_ICON[kind] || '📁'}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.file_name}>
                              {f.file_name}
                            </div>
                            <div style={{ marginTop: 3 }}><FileTypeBadge kind={kind} size="sm" /></div>
                          </div>
                        </div>
                      </td>
                      {/* Deal */}
                      <td style={{ padding: '12px', color: 'var(--text)', maxWidth: 160 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={dealTitle(f.deal_id || f.listing_id)}>
                          {dealTitle(f.deal_id || f.listing_id)}
                        </span>
                      </td>
                      {/* Category */}
                      <td style={{ padding: '12px' }}><CategoryBadge category={f.category as any} /></td>
                      {/* Status */}
                      <td style={{ padding: '12px' }}>
                        <select
                          value={f.status as any}
                          onChange={(e) => onStatusChange(f, e.target.value as FinancialStatus)}
                          style={{ padding: '4px 6px', borderRadius: 6, border: `1px solid ${(f) ? '' : ''}var(--line)`, fontSize: 11.5, background: '#fff', color: 'var(--text)', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
                        >
                          {(['pending', 'processed', 'recast_done', 'bov_done', 'cim_done'] as FinancialStatus[]).map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                          ))}
                        </select>
                      </td>
                      {/* Size */}
                      <td style={{ padding: '12px', color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{formatBytes(f.file_size)}</td>
                      {/* Uploaded by */}
                      <td style={{ padding: '12px', color: 'var(--muted)', fontSize: 12.5 }}>
                        {isAdmin && userId && f.uploaded_by !== userId ? 'Broker/Admin' : f.uploaded_by === userId ? 'You' : '—'}
                      </td>
                      {/* Date */}
                      <td style={{ padding: '12px', color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {f.uploaded_at ? new Date(f.uploaded_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            title="Preview"
                            onClick={() => setPreview(f as any)}
                            className="btn-ghost"
                            style={{ padding: '5px 9px', fontSize: 13 }}
                          >👁️</button>
                          <a
                            title="Download"
                            href={f.file_url}
                            download={f.file_name}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost"
                            style={{ padding: '5px 9px', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                          >⬇️</a>
                          <button
                            title={canDelete ? 'Delete' : 'Only the uploader or broker/admin can delete'}
                            onClick={() => canDelete ? setConfirmDelete(f) : toast('Only the uploader or a broker/admin can delete this file', 'info')}
                            className="btn-danger"
                            style={{ padding: '5px 9px', fontSize: 13 }}
                            disabled={deleting === f.id}
                          >{deleting === f.id ? '…' : '🗑️'}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,20,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 'min(420px, 100%)', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 22 }}>🗑️</div>
            <h3 style={{ fontFamily: 'Georgia, serif', color: 'var(--navy)', margin: '10px 0 6px', fontSize: 19 }}>Delete file?</h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: 0, lineHeight: 1.5, wordBreak: 'break-all' }}>
              <strong style={{ color: 'var(--text)' }}>{confirmDelete.file_name}</strong> will be permanently removed from storage and the database. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => onDelete(confirmDelete)} style={{ fontWeight: 700 }}>
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      <FilePreviewModal doc={preview as any} onClose={() => setPreview(null)} />
    </div>
  )
}
