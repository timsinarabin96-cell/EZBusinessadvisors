/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { LoadingState } from '@/components/ui'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { getAgencyContext } from '@/lib/agencyContext'
import { getStoredAccessToken } from '@/lib/authToken'
import { Chip, GoldButton, PremiumTabs, SoftButton, PageHero } from '@/components/ui/premium'

export default function ToolsPage() {
  return (
    <AppShell active="CSV Tools">
      <ToastProvider>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 18px 60px' }}>
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
      <PageHero
        icon="🧰"
        eyebrow="CSV Tools"
        title="CSV Tools"
        sub="Export listings and leads, or bulk-import buyer/seller leads from CSV."
      />

      <div className="p-card p-card-pad mb-6">
        <h2 className="font-semibold mb-3">Export</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ['listings', 'Listings'],
            ['buyers', 'Buyer leads'],
            ['sellers', 'Seller leads'],
          ].map(([type, label]) => (
            <SoftButton
              key={type}
              onClick={() => exportCsv(type)}
            >
              ↓ Export {label}
            </SoftButton>
          ))}
        </div>
      </div>

      <div className="p-card p-card-pad">
        <h2 className="font-semibold mb-3">Import leads</h2>
        <PremiumTabs tabs={[{ key: 'buyer', label: 'Buyer leads', hint: 'Acquisition prospects' }, { key: 'seller', label: 'Seller leads', hint: 'Listing prospects' }]} active={importType} onChange={setImportType} />
        <textarea
          className="border rounded-lg p-3 text-sm w-full font-mono h-40"
          placeholder={`Paste CSV with headers. Example (${importType}):\nemail,contact_name,company,phone\nbuyer@example.com,John Doe,Acme Inc,555-0100`}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <div className="mt-3"><GoldButton onClick={doImport} disabled={busy}>{busy ? 'Importing…' : 'Import CSV'}</GoldButton></div>
        {result && (
          <div className="mt-4 text-sm">
            <Chip tone="green">✓ Imported {result.imported} leads</Chip>
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
