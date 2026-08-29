/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchRoom, uploadRoomFile, createRoomFolder, renameRoomItem, deleteRoomItem,
  restoreRoomFile, moveRoomFile, setRoomFileAccess, setRoomFolderAccess,
  accessLabel, ACCESS_OPTIONS,
  type RoomSnapshot, type RoomFolder, type RoomFile, type RoomRole,
} from '@/lib/dataRoom'

const ACTION_LABEL: Record<string, string> = {
  uploaded: '📤 uploaded', deleted: '🗑️ deleted', created: '📁 created',
  renamed: '✏️ renamed', restored: '♻️ restored', moved: '📂 moved', updated: '🔧 updated',
}
const KIND_ICON: Record<string, string> = {
  pdf: '📕', excel: '📊', word: '📄', image: '🖼️', video: '🎬', other: '📦',
}
const fmtSize = (n: number | null | undefined) => {
  if (!n) return '—'
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  if (n > 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}
const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago'
}
const ACCESS_ICON: Record<string, string> = {
  all_parties: '🌐', buyer_only: '🤝', seller_only: '🏠', agent_only: '🔒',
}

// =============================================================================
// Deal Room — one Dropbox-style shared workspace per deal.
// -----------------------------------------------------------------------------
// Agents (session) see everything + manage access levels + restore trash.
// Buyers/sellers (portal token) see only their role's folders/files and can
// upload/rename/delete within what's visible to them.
// =============================================================================

export default function DealRoom({
  dealId,
  token,
  compact = false,
}: {
  dealId: string
  /** Portal token — when present, acts as the buyer/seller instead of the session user. */
  token?: string
  compact?: boolean
}) {
  const [snap, setSnap] = useState<RoomSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeFolder, setActiveFolder] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [zipBusy, setZipBusy] = useState(false)
  const [renaming, setRenaming] = useState<{ kind: 'file' | 'folder'; id: string; name: string } | null>(null)
  const [moving, setMoving] = useState<{ id: string; name: string; folderId: string | null } | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderAccess, setNewFolderAccess] = useState('all_parties')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [accessTarget, setAccessTarget] = useState<{ kind: 'file' | 'folder'; id: string; name: string; level: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, setToast] = useState('')

  const role: RoomRole = snap?.role || 'agent'
  const isAgent = role === 'agent'

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const s = await fetchRoom(dealId, token)
    setSnap(s)
    setError(s.ok ? '' : s.error || 'Failed to load deal room')
    setLoading(false)
  }, [dealId, token])

  useEffect(() => { load() }, [load])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const f of Array.from(files)) {
      // Portal uploads inherit the folder's access; agent picks (defaults all_parties).
      const r = await uploadRoomFile(dealId, f, activeFolder, token, isAgent ? undefined : undefined)
      if (!r.ok) { flash(r.error || 'Upload failed'); break }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    flash('Files uploaded ✅')
    load()
  }

  const downloadZip = async () => {
    setZipBusy(true)
    try {
      const qs = new URLSearchParams({ dealId })
      if (token) qs.set('token', token)
      const res = await fetch(`/api/data-rooms/export?${qs.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash(j.error || 'Could not build ZIP')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'deal-room.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      flash('ZIP downloaded 📦')
    } catch {
      flash('Could not build ZIP')
    } finally {
      setZipBusy(false)
    }
  }

  const handleNewFolder = async () => {
    const name = newFolderName.trim()
    if (!name) return
    const r = await createRoomFolder(dealId, name, token, isAgent ? newFolderAccess : undefined)
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

  const handleRestore = async (fileId: string) => {
    const r = await restoreRoomFile(dealId, fileId, token)
    if (r.ok) { flash('Restored ♻️'); load() }
    else flash(r.error || 'Could not restore')
  }

  const handleMove = async () => {
    if (!moving) return
    const r = await moveRoomFile(dealId, moving.id, moving.folderId, token)
    if (r.ok) { setMoving(null); flash('Moved 📂'); load() }
    else flash(r.error || 'Could not move')
  }

  const handleSetAccess = async () => {
    if (!accessTarget) return
    const r = accessTarget.kind === 'file'
      ? await setRoomFileAccess(dealId, accessTarget.id, accessTarget.level, token)
      : await setRoomFolderAccess(dealId, accessTarget.id, accessTarget.level, token)
    if (r.ok) { setAccessTarget(null); flash('Access updated 🔧'); load() }
    else flash(r.error || 'Could not update access')
  }

  const folders = snap?.folders || []
  const files = (snap?.files || []).filter((f) => (activeFolder ? f.folder_id === activeFolder : true))
  const trash = snap?.trash || []
  const roomName = snap?.room?.name || 'Deal Room'
  const roleLabel = role === 'agent' ? 'Agent view' : role === 'buyer' ? 'Buyer view' : 'Seller view'

  if (loading && !snap) {
    return <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Loading deal room…</div>
  }
  if (error && !snap) {
    return <div style={{ padding: 24, color: '#b91c1c', textAlign: 'center' }}>{error}</div>
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>📁 Deal Room · {roleLabel}</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{roomName}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => setShowNewFolder((v) => !v)}>+ Folder</button>
          <button className="btn btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={downloadZip} disabled={zipBusy}>
            {zipBusy ? 'Zipping…' : '📦 ZIP'}
          </button>
          {isAgent && (trash.length > 0) && (
            <button className="btn btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => setShowTrash((v) => !v)}>
              🗑️ Trash ({trash.length})
            </button>
          )}
          <button className="btn" style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#fff' }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '⬆ Upload'}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
        </div>
      </div>

      {toast && (
        <div style={{ padding: '8px 18px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>{toast}</div>
      )}

      {/* New folder inline (access picker for agents) */}
      {showNewFolder && (
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4', flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" onKeyDown={(e) => e.key === 'Enter' && handleNewFolder()} style={{ flex: 1, minWidth: 160 }} />
          {isAgent && (
            <select className="input" value={newFolderAccess} onChange={(e) => setNewFolderAccess(e.target.value)} style={{ maxWidth: 230 }}>
              {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
            </select>
          )}
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
            {f.icon || '📁'} {f.name} {ACCESS_ICON[f.access_level || 'all_parties'] && <span style={{ opacity: 0.65 }}>{ACCESS_ICON[f.access_level || 'all_parties']}</span>}
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
            <FileRow
              key={f.id} file={f} folder={folders.find((x) => x.id === f.folder_id)} isAgent={isAgent}
              onOpen={() => window.open(f.file_url, '_blank', 'noreferrer')}
              onRename={() => setRenaming({ kind: 'file', id: f.id, name: f.file_name })}
              onMove={() => setMoving({ id: f.id, name: f.file_name, folderId: f.folder_id })}
              onAccess={() => setAccessTarget({ kind: 'file', id: f.id, name: f.file_name, level: f.access_level || 'all_parties' })}
              onDelete={() => handleDelete('file', f.id, f.file_name)}
            />
          ))
        )}
      </div>

      {/* Trash (agents only) */}
      {showTrash && isAgent && (
        <div style={{ borderTop: '1px solid var(--line)', background: '#fef2f2', padding: '12px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>🗑️ Recycle bin</div>
          {trash.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Trash is empty.</div>
          ) : trash.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #fecaca' }}>
              <span>{KIND_ICON[t.file_kind || 'other'] || '📄'}</span>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.file_name}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{timeAgo(t.uploaded_at)}</span>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleRestore(t.id)}>♻️ Restore</button>
            </div>
          ))}
        </div>
      )}

      {/* Rename inline */}
      {renaming && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4' }}>
          <input className="input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && handleRename()} style={{ flex: 1 }} />
          <button className="btn btn-navy" onClick={handleRename} disabled={!renaming.name.trim()}>Save</button>
          <button className="btn btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
        </div>
      )}

      {/* Move inline */}
      {moving && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Move “{moving.name}” to:</span>
          <select className="input" value={moving.folderId || ''} onChange={(e) => setMoving({ ...moving, folderId: e.target.value || null })} style={{ maxWidth: 240 }}>
            <option value="">📂 Root (no folder)</option>
            {folders.filter((x) => x.id !== (files.find((f) => f.id === moving.id)?.folder_id)).map((x) => (
              <option key={x.id} value={x.id}>{x.icon || '📁'} {x.name}</option>
            ))}
          </select>
          <button className="btn btn-navy" onClick={handleMove}>Move</button>
          <button className="btn btn-ghost" onClick={() => setMoving(null)}>Cancel</button>
        </div>
      )}

      {/* Access-level editor (agents only) */}
      {accessTarget && isAgent && (
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, background: '#faf9f4', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>“{accessTarget.name}” visible to:</span>
          <select className="input" value={accessTarget.level} onChange={(e) => setAccessTarget({ ...accessTarget, level: e.target.value })} style={{ maxWidth: 240 }}>
            {ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
          </select>
          <button className="btn btn-navy" onClick={handleSetAccess}>Save</button>
          <button className="btn btn-ghost" onClick={() => setAccessTarget(null)}>Cancel</button>
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

function FileRow({ file, folder, isAgent, onOpen, onRename, onMove, onAccess, onDelete }: {
  file: RoomFile
  folder?: RoomFolder | null
  isAgent: boolean
  onOpen: () => void
  onRename: () => void
  onMove: () => void
  onAccess: () => void
  onDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={onOpen}>
      <span style={{ fontSize: 22 }}>{KIND_ICON[file.file_kind || 'other'] || '📄'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file.file_name}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {folder?.name || 'Root'} · v{file.version} · {file.uploaded_by_name || '—'}{file.uploaded_by_role ? ` (${file.uploaded_by_role})` : ''} · {fmtSize(file.file_size)} · {timeAgo(file.uploaded_at)}
        </div>
      </div>
      <span title={accessLabel(file.access_level)} style={{ fontSize: 12, background: '#f1f5f9', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px', color: 'var(--muted)' }}>
        {ACCESS_ICON[file.access_level || 'all_parties'] || '🌐'} {accessLabel(file.access_level)}
      </span>
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onRename() }}>✏️</button>
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onMove() }}>📂</button>
      {isAgent && (
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={(e) => { e.stopPropagation(); onAccess() }}>🔐</button>
      )}
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: '#b91c1c' }} onClick={(e) => { e.stopPropagation(); onDelete() }}>🗑️</button>
    </div>
  )
}
