'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatWithCommas } from '@/components/ui/MoneyInput'
import { getStoredAccessToken } from '@/lib/authToken'

interface Search {
  id: string
  name: string
  criteria: Record<string, unknown>
  notify_email: boolean
  active: boolean
  last_match_at: string | null
  created_at: string
}

interface Bookmark {
  id: string
  listing_id: string
  created_at: string
  listings?: { id: string; business_name: string | null; asking_price: number | null; industry: string | null; location_general: string | null; status: string | null }
}

interface Alert {
  id: string
  listing_id: string
  match_score: number
  status: string
  created_at: string
  listings?: { id: string; business_name: string | null; asking_price: number | null; industry: string | null; location_general: string | null }
}

const money = (n: number | null | undefined) => (n != null ? '$' + Math.round(n).toLocaleString() : '—')
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export default function WatchlistPage() {
  const router = useRouter()
  const [searches, setSearches] = useState<Search[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [industries, setIndustries] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minSde, setMinSde] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const res = await fetch('/api/marketplace/watchlist', { headers: { authorization: `Bearer ${getStoredAccessToken()}` } })
    if (!res.ok) {
      setError('Could not load watchlist')
      setLoading(false)
      return
    }
    const data = await res.json()
    setSearches(data.searches || [])
    setBookmarks(data.bookmarks || [])
    setAlerts(data.alerts || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authHeaders = () => ({ authorization: `Bearer ${getStoredAccessToken()}`, 'content-type': 'application/json' })

  const createSearch = async () => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/marketplace/watchlist', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name: name.trim() || 'Untitled search',
        criteria: {
          industries: industries.split(',').map((s) => s.trim()).filter(Boolean),
          max_price: maxPrice ? Number(String(maxPrice).replace(/[$,]/g, '')) : null,
          min_sde: minSde ? Number(String(minSde).replace(/[$,]/g, '')) : null,
        },
        notify_email: true,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Could not save search')
    } else {
      setName('')
      setIndustries('')
      setMaxPrice('')
      setMinSde('')
      await load()
    }
    setSaving(false)
  }

  const toggleSearch = async (search: Search) => {
    const res = await fetch('/api/marketplace/watchlist', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ searchId: search.id, active: !search.active }),
    })
    if (res.ok) await load()
  }

  const toggleEmail = async (search: Search) => {
    const res = await fetch('/api/marketplace/watchlist', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ searchId: search.id, notify_email: !search.notify_email }),
    })
    if (res.ok) await load()
  }

  const deleteSearch = async (id: string) => {
    const res = await fetch('/api/marketplace/watchlist', {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ searchId: id }),
    })
    if (res.ok) await load()
  }

  const removeBookmark = async (id: string) => {
    const res = await fetch('/api/marketplace/watchlist', {
      method: 'DELETE',
      headers: authHeaders(),
      body: JSON.stringify({ bookmarkId: id }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🔔 Deal Alerts & Watchlist</h1>
        <p className="text-gray-500 text-sm mt-1">
          Saved searches alert you the moment a matching business goes live. Bookmark listings to track them.
        </p>
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {/* New saved search */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold mb-3">Create a saved search</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Search name (e.g. Laundromats < $500k)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Industries (comma-separated)" value={industries} onChange={(e) => setIndustries(e.target.value)} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Max price ($)" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(formatWithCommas(e.target.value))} />
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Min SDE ($)" inputMode="decimal" value={minSde} onChange={(e) => setMinSde(formatWithCommas(e.target.value))} />
        </div>
        <button
          onClick={createSearch}
          disabled={saving}
          className="mt-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {saving ? 'Saving…' : '+ Save search'}
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : (
        <>
          {/* Alerts feed */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold mb-3">🎯 New matches</h2>
            {alerts.length === 0 ? (
              <p className="text-gray-400 text-sm">No matches yet. Saved searches fire automatically when a qualifying listing is approved.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {alerts.map((alert) => (
                  <li key={alert.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{alert.listings?.business_name || 'New listing'}</p>
                      <p className="text-xs text-gray-500">
                        {alert.listings?.industry || '—'} · {money(alert.listings?.asking_price)} · {fmtDate(alert.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">Score {alert.match_score}/100</span>
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => router.push(`/marketplace/listings/${alert.listing_id}`)}
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Saved searches */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <h2 className="font-semibold mb-3">📌 Saved searches</h2>
            {searches.length === 0 ? (
              <p className="text-gray-400 text-sm">No saved searches yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {searches.map((search) => (
                  <li key={search.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{search.name}</p>
                      <p className="text-xs text-gray-500">
                        {search.active ? 'Active' : 'Paused'} · {search.notify_email ? 'email alerts on' : 'email off'} · last match {fmtDate(search.last_match_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleSearch(search)}
                        className={`text-xs px-2 py-1 rounded-full border ${search.active ? 'bg-gray-100 border-gray-200 text-gray-600' : 'bg-green-50 border-green-200 text-green-700'}`}
                      >
                        {search.active ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        onClick={() => toggleEmail(search)}
                        title="Turn email alerts on/off for this search"
                        className={`text-xs px-2 py-1 rounded-full border ${search.notify_email ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-500'}`}
                      >
                        {search.notify_email ? '✉️ Alerts on' : '✉️ Alerts off'}
                      </button>
                      <button onClick={() => deleteSearch(search.id)} className="text-xs text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bookmarks */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">🔖 Bookmarked listings</h2>
            {bookmarks.length === 0 ? (
              <p className="text-gray-400 text-sm">No bookmarks yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {bookmarks.map((bookmark) => (
                  <li key={bookmark.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{bookmark.listings?.business_name || 'Listing'}</p>
                      <p className="text-xs text-gray-500">
                        {bookmark.listings?.industry || '—'} · {money(bookmark.listings?.asking_price)} · {fmtDate(bookmark.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="text-xs text-blue-600 hover:underline" onClick={() => router.push(`/marketplace/listings/${bookmark.listing_id}`)}>
                        View
                      </button>
                      <button className="text-xs text-red-500 hover:underline" onClick={() => removeBookmark(bookmark.id)}>
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
