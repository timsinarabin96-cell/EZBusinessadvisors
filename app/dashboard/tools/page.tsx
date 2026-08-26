/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'

export default function ToolsPage() {
  return (
    <AppShell active="CSV Tools">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 20px 60px' }}>
          <CsvTools />
        </div>
      </ToastProvider>
    </AppShell>
  )
}

function CsvTools() {
  const toast = useToast()
  const [agencyId, setAgencyId] = useState('')
  const [loading, setLoading] = useState(true)
  const [importType, setImportType] = useState<'buyer' | 'seller'>('buyer')
  const [csvText, setCsvText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)

  useEffect(() => {
    ;(async () => {
      const ctx = await getAgencyContext()
      if (!ctx) { setLoading(false); return }
      setAgencyId(ctx.agencyId)
      setLoading(false)
    })()
  }, [])

  const exportCsv = async (type: string) => {
    const token = getStoredAccessToken()
    const res = await fetch(`/api/tools/csv?agencyId=${agencyId}&type=${type}`, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) return toast('Export failed', 'error')
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('Export downloaded', 'success')
  }

  const doImport = async () => {
    if (!csvText.trim()) return toast('Paste CSV content first', 'error')
    setBusy(true)
    setResult(null)
    const token = getStoredAccessToken()
    const res = await fetch('/api/tools/csv', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ agencyId, type: importType, csv: csvText }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !data.ok) return toast(data.error || 'Import failed', 'error')
    setResult(data)
    toast(`Imported ${data.imported} leads`, 'success')
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🧰 CSV Tools</h1>
        <p className="text-gray-500 text-sm mt-1">Export listings and leads, or bulk-import buyer/seller leads from CSV.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Export</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['listings', 'Listings'],
            ['buyers', 'Buyer leads'],
            ['sellers', 'Seller leads'],
          ].map(([type, label]) => (
            <button
              key={type}
              onClick={() => exportCsv(type)}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              Export {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">Import leads</h2>
        <div className="flex gap-2 mb-3">
          {(['buyer', 'seller'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setImportType(t)}
              className={`text-sm px-3 py-1.5 rounded-full border capitalize ${importType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              {t} leads
            </button>
          ))}
        </div>
        <textarea
          className="border rounded-lg p-3 text-sm w-full font-mono h-40"
          placeholder={`Paste CSV with headers. Example (${importType}):\nemail,contact_name,company,phone\nbuyer@example.com,John Doe,Acme Inc,555-0100`}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button
          onClick={doImport}
          disabled={busy}
          className="mt-3 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg"
        >
          {busy ? 'Importing…' : 'Import CSV'}
        </button>
        {result && (
          <div className="mt-4 text-sm">
            <p className="text-green-700 font-medium">✅ Imported {result.imported} leads</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 text-red-600 text-xs space-y-1">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
