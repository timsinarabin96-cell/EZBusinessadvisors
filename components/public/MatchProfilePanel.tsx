/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useState } from 'react'
import { getBuyerProfile, saveBuyerProfile, clearBuyerProfile, type BuyerProfile } from '@/lib/publicFavorites'

/**
 * "Refine my matches" — visitor sets a buyer profile (stored in the browser)
 * and every listing card shows a zero-token AI match score (lib/matchScore).
 */
export default function MatchProfilePanel({ industries }: { industries: string[] }) {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<BuyerProfile>(() => getBuyerProfile())
  const [saved, setSaved] = useState(false)

  const hasProfile = profile.industries.length > 0 || profile.max_price != null || profile.min_sde != null || profile.locations.length > 0

  const save = () => {
    saveBuyerProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    // Trigger re-render of cards by nudging localStorage consumers.
    window.dispatchEvent(new Event('concord-match-profile-updated'))
  }

  const reset = () => {
    clearBuyerProfile()
    setProfile({ industries: [], max_price: null, min_sde: null, locations: [], absentee_preferred: false, franchise_ok: true })
    window.dispatchEvent(new Event('concord-match-profile-updated'))
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #ece8dc', borderRadius: 12, padding: 18, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>🎯 AI match scores</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {hasProfile ? 'Scores active — every card shows your fit %.' : "Set what you're looking for and we'll score every listing for you."}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setOpen(!open)} style={{ background: open ? '#1a1a2e' : '#faf9f4', color: open ? '#fff' : '#1a1a2e', border: open ? 'none' : '1px solid #d8d2c2', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {open ? 'Close' : hasProfile ? 'Edit profile' : 'Set up'}
          </button>
          {hasProfile && (
            <button onClick={reset} style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Industries</div>
            <input
              value={profile.industries.join(', ')}
              onChange={(e) => setProfile({ ...profile, industries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="laundromat, car wash…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Max price ($)</div>
            <input
              value={profile.max_price ?? ''}
              onChange={(e) => setProfile({ ...profile, max_price: e.target.value ? Number(e.target.value) : null })}
              type="number"
              placeholder="500000"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Min SDE ($)</div>
            <input
              value={profile.min_sde ?? ''}
              onChange={(e) => setProfile({ ...profile, min_sde: e.target.value ? Number(e.target.value) : null })}
              type="number"
              placeholder="100000"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, outline: 'none' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Locations</div>
            <input
              value={profile.locations.join(', ')}
              onChange={(e) => setProfile({ ...profile, locations: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="NY, FL…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #d8d2c2', borderRadius: 6, fontSize: 13, outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, alignSelf: 'end', paddingBottom: 4 }}>
            <label style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={profile.absentee_preferred} onChange={(e) => setProfile({ ...profile, absentee_preferred: e.target.checked })} style={{ width: 15, height: 15, accentColor: '#1a1a2e', cursor: 'pointer' }} />
              Absentee ok
            </label>
            <label style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={profile.franchise_ok} onChange={(e) => setProfile({ ...profile, franchise_ok: e.target.checked })} style={{ width: 15, height: 15, accentColor: '#1a1a2e', cursor: 'pointer' }} />
              Franchise ok
            </label>
          </div>
          <button onClick={save} style={{ background: '#c9a84c', color: '#1a1a2e', border: 'none', borderRadius: 6, padding: '10px 18px', fontWeight: 800, cursor: 'pointer', alignSelf: 'end' }}>
            {saved ? '✓ Saved' : 'Save & score'}
          </button>
        </div>
      )}
    </div>
  )
}
