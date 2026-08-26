/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchDataRoom, uploadRoomFile, createRoomFolder, renameRoomItem, deleteRoomItem,
  type DataRoomSnapshot, type DataRoomFile, type DataRoomFolder,
} from '@/lib/dataRoom'

// =============================================================================
// Deal Data Room — Dropbox-style shared folder per deal.
// -----------------------------------------------------------------------------
// Folders + files + upload + rename + delete + activity feed. Every party can
// edit and delete: brokers/agents via session, buyers/sellers via portal token.
// =============================================================================

const KIND_ICON: Record<string, string> = {
  pdf: '📕', excel: '📊', word: '📝', image: '🖼️', video: '🎬', other: '📄',
}

const fmtSize = (n: number | null | undefined) => {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

const ACTION_LABEL: Record<string, string> = {
  uploaded: '📤 uploaded', deleted: '🗑️ deleted', created: '📁 created',
  renamed: '✏️ renamed', restored: '♻️ restored', viewed: '👀 viewed',
  downloaded: '⬇️ downloaded', commented: '💬 commented',
}

export default function DealDataRoom({
  dealId,
  token,
  compact = false,
}: {
  dealId: string
  /** Portal token — when present, acts as the buyer/seller instead of the session user. */
  token?: string
  compact?: boolean
}) {
  const [snap, setSnap] = useState<DataRoomSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [renaming, setRenaming] = useState<{ kind: 'file' | 'folder'; id: string; name: string } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState('')

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const s = await fetchDataRoom(dealId, token)
    setSnap(s)
    setError(s.ok ? '' : s.error || 'Failed to load data room')
    setLoading(false)
  }, [dealId, token])

  useEffect(() => { load() }, [load])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const f of Array.from(files)) {
      const r = await uploadRoomFile(dealId, f, activeFolder, token)
      if (!r.ok) { flash(r.error || 'Upload failed'); break }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    flash('Files uploaded ✅')
    load()
  }

  const handleNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    const r = await createRoomFolder(dealId, name, token)
    if (r.ok) { setNewFolderName(''); setShowNewFolder(false); flash('Folder created 📁'); load() }
    else flash(r.error || 'Could not create folder')
  }

  const handleRename = async () => {
    if (!renaming || !renaming.name.trim()) return
    const r = await renameRoomItem(dealId, renaming.kind, renaming.id, renaming.name.trim(), token)
    if (r.ok) { setRenaming(null); flash('Renamed ✏️'); load() }
    else flash(r.error || 'Could not rename')
  }

  const handleDelete = async (kind: 'file' | 'folder', id: string, name: string) => {
    if (!confirm(`Delete "${name}"?${kind === 'folder' ? ' Files inside stay in the room but lose their folder.' : ' It moves to the recycle bin.'}`)) return
    const r = await deleteRoomItem(dealId, kind, id, token)
    if (r.ok) { flash('Deleted 🗑️'); load() }
    else flash(r.error || 'Could not delete')
  }

  const folders = snap?.folders || []
  const files = (snap?.files || []).filter((f) => (activeFolder ? f.folder_id === activeFolder : true))
  const roomName = snap?.room?.name || 'Deal Data Room'

  if (loading && !snap) {
    return <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Loading data room…</div>
  }
  if (error && !snap) {
    return <div style={{ padding: 24, color: '#b91c1c', textAlign: 'center' }}>{error}</div>
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>📁 Data Room</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{roomName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => setShowNewFolder((v) => !v)}>+ Folder</button>
          <button className="btn" style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#fff' }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '⬆ Upload'}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
        </div>
      </div>

      {toast && (
        <div style={{ padding: '8px 18px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {/* New folder inline */}
      {showNewFolder && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4' }}>
          <input className="input" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" onKeyDown={(e) => e.key === 'Enter' && handleNewFolder()} style={{ flex: 1 }} />
          <button className="btn btn-navy" onClick={handleNewFolder} disabled={!newFolderName.trim()}>Create</button>
        </div>
      )}

      {/* Folder chips */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setActiveFolder(null)}
          style={{
            padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            border: activeFolder === null ? '2px solid var(--gold-dark)' : '1px solid var(--line)',
            background: activeFolder === null ? 'rgba(201,168,76,0.15)' : '#fff', color: activeFolder === null ? 'var(--gold-dark)' : 'var(--muted)',
          }}
        >
          📂 All Files
        </button>
        {folders.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: activeFolder === f.id ? '2px solid var(--gold-dark)' : '1px solid var(--line)',
              background: activeFolder === f.id ? 'rgba(201,168,76,0.15)' : '#fff', color: activeFolder === f.id ? 'var(--gold-dark)' : 'var(--muted)',
            }}
          >
            {f.icon || '📁'} {f.name}
          </button>
        ))}
      </div>

      {/* File list */}
      <div style={{ minHeight: 160 }}>
        {files.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
            {activeFolder ? 'This folder is empty.' : 'No files yet — upload financials, due-diligence docs, or contracts.'}
          </div>
        ) : (
          files.map((f) => (
            <FileRow key={f.id} file={f} folder={folders.find((x) => x.id === f.folder_id)} onOpen={() => window.open(f.file_url, '_blank', 'noreferrer')} onRename={() => setRenaming({ kind: 'file', id: f.id, name: f.file_name })} onDelete={() => handleDelete('file', f.id, f.file_name)} />
          ))
        )}
      </div>

      {/* Rename inline */}
      {renaming && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4' }}>
          <input className="input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleRename()} style={{ flex: 1 }} />
          <button className="btn btn-navy" onClick={handleRename} disabled={!renaming.name.trim()}>Save</button>
          <button className="btn btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
        </div>
      )}

      {/* Activity feed */}
      {(snap?.activities?.length || 0) > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', background: '#faf9f4' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {snap!.activities!.slice(0, 6).map((a) => (
              <div key={a.id} style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                <span style={{ color: 'var(--navy)', fontWeight: 600 }}>{ACTION_LABEL[a.action] || a.action}</span> {a.details}
                <span style={{ color: '#aaa' }}> · {a.user_email || '—'} · {timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FileRow({ file, folder, onOpen, onRename, onDelete }: {
  file: DataRoomFile
  folder?: DataRoomFolder | null
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={onOpen}>
      <span style={{ fontSize: 22 }}>{KIND_ICON[file.file_kind || 'other'] || '📄'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.file_name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {folder?.name || 'Root'} · v{file.version} · {file.uploaded_by_name || '—'} · {fmtSize(file.file_size)} · {timeAgo(file.uploaded_at)}
        </div>
      </div>
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onRename() }}>✏️</button>
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#b91c1c' }} onClick={(e) => { e.stopPropagation(); onDelete() }}>🗑️</button>
    </div>
  )
}
