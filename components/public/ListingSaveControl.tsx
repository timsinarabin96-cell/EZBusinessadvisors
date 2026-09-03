/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useState } from 'react'
import { isFavorite, toggleFavorite, isComparing, toggleCompare, getSavedEmail, setSavedIdentity, syncSavedListing } from '@/lib/publicFavorites'

/**
 * Save-to-favorites control for surfaces that do NOT render PublicListingCard
 * (listing detail hero, etc.). Mirrors the card's exact UX: first save prompts
 * for an email so the saved list follows the buyer across devices; unsave drops
 * locally + server-side when an email identity is known.
 */
export default function ListingSaveControl({ listingId, listingTitle, variant = 'hero' }: { listingId: string; listingTitle: string; variant?: 'hero' | 'aside' }) {
  const [fav, setFav] = useState(false)
  const [compare, setCompare] = useState(false)
  const [compareFull, setCompareFull] = useState(false)
  const [showEmailPrompt, setShowEmailPrompt] = useState(false)
  const [emailPromptValue, setEmailPromptValue] = useState('')
  const [emailPromptBusy, setEmailPromptBusy] = useState(false)
  const [emailPromptError, setEmailPromptError] = useState('')

  useEffect(() => {
    setFav(isFavorite(listingId))
    setCompare(isComparing(listingId))
  }, [listingId])

  const onSave = () => {
    if (fav) {
      toggleFavorite(listingId)
      setFav(false)
      if (getSavedEmail()) void syncSavedListing(listingId, false)
      return
    }
    if (!getSavedEmail()) {
      setShowEmailPrompt(true)
      return
    }
    toggleFavorite(listingId)
    setFav(true)
    void syncSavedListing(listingId, true)
  }

  const submitEmailSave = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const email = emailPromptValue.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailPromptError('Enter a valid email so your saved list follows you.')
      return
    }
    setEmailPromptBusy(true)
    setEmailPromptError('')
    try {
      const res = await fetch('/api/public/saved-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, listingId, action: 'add' }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (!res.ok || !data.ok) {
        setEmailPromptError(data.error || 'Could not save — try again.')
        return
      }
      setSavedIdentity(data.email, data.token)
      toggleFavorite(listingId)
      setFav(true)
      setShowEmailPrompt(false)
      setEmailPromptValue('')
    } catch {
      setEmailPromptError('Could not save — try again.')
    } finally {
      setEmailPromptBusy(false)
    }
  }

  const saveLocallyOnly = () => {
    toggleFavorite(listingId)
    setFav(true)
    setShowEmailPrompt(false)
    setEmailPromptValue('')
  }

  const onCompare = () => {
    const result = toggleCompare(listingId)
    setCompare(isComparing(listingId))
    if (result.full) setCompareFull(true)
  }

  const heroStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: fav ? '1px solid rgba(225,29,72,0.6)' : '1px solid rgba(255,255,255,0.35)',
    background: fav ? 'rgba(225,29,72,0.16)' : 'rgba(255,255,255,0.08)',
    color: fav ? '#fda4af' : '#fff',
    padding: '8px 16px',
    borderRadius: 99,
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    backdropFilter: 'blur(8px)',
    transition: 'all 0.15s',
  } as React.CSSProperties

  const asideStyle = {
    width: '100%',
    justifyContent: 'center',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    border: fav ? '1px solid rgba(225,29,72,0.5)' : '1px solid #d8d2c2',
    background: fav ? '#fef2f4' : '#fff',
    color: fav ? '#e11d48' : '#1a1a2e',
    padding: '11px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
  } as React.CSSProperties

  return (
    <>
      <div style={variant === 'hero' ? { display: 'inline-flex', gap: 8, alignItems: 'center' } : { display: 'grid', gap: 8 }}>
        <button type="button" onClick={onSave} title={fav ? 'Remove from favorites' : 'Save to favorites'} style={variant === 'hero' ? heroStyle : asideStyle}>
          <span style={{ fontSize: variant === 'hero' ? 16 : 15, lineHeight: 1 }}>{fav ? '♥' : '♡'}</span>
          {fav ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCompare}
          title={compare ? 'Remove from compare' : 'Add to compare'}
          style={{
            ...(variant === 'hero' ? heroStyle : asideStyle),
            ...(variant === 'hero'
              ? { border: compare ? '1px solid rgba(201,168,76,0.7)' : '1px solid rgba(255,255,255,0.35)', background: compare ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.08)', color: compare ? '#f0d98c' : '#fff' }
              : { border: compare ? '1px solid #c9a84c' : '1px solid #d8d2c2', background: compare ? '#fdf9ef' : '#fff', color: compare ? '#8a6d1a' : '#1a1a2e' }),
          }}
        >
          <span style={{ fontSize: variant === 'hero' ? 14 : 13, lineHeight: 1 }}>⚖</span>
          {compare ? 'Comparing' : 'Compare'}
        </button>
      </div>

      {compareFull && (
        <div style={{ position: 'fixed', zIndex: 60, bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a1a2e', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, boxShadow: '0 10px 40px rgba(0,0,0,0.35)' }}>
          Compare up to 3 — open <a href="/marketplace/compare" style={{ color: '#c9a84c' }}>compare tray</a>
        </div>
      )}

      {showEmailPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,14,28,0.55)', padding: 20 }}>
          <form
            onSubmit={submitEmailSave}
            style={{ background: '#fff', borderRadius: 16, padding: 22, width: '100%', maxWidth: 380, boxShadow: '0 18px 60px rgba(0,0,0,0.35)', border: '1px solid #ece8dc' }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', fontFamily: 'Georgia, serif' }}>♥ Save this listing</div>
            <div style={{ fontSize: 13, color: '#888', margin: '8px 0 14px', lineHeight: 1.55 }}>
              {listingTitle} — enter your email and it stays saved on any device until the deal is gone.
            </div>
            <input
              type="email"
              autoFocus
              value={emailPromptValue}
              onChange={(e) => setEmailPromptValue(e.target.value)}
              placeholder="you@email.com"
              style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 9, border: '1px solid #d8d2c2', fontSize: 14, outline: 'none' }}
            />
            {emailPromptError && <div style={{ fontSize: 12.5, color: '#e11d48', marginTop: 7 }}>{emailPromptError}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                type="submit"
                disabled={emailPromptBusy}
                style={{ flex: 1, background: 'linear-gradient(135deg,#c9a84c,#a8872f)', color: '#1a1a2e', border: 'none', borderRadius: 9, padding: '11px 0', fontWeight: 800, cursor: emailPromptBusy ? 'wait' : 'pointer', fontSize: 14 }}
              >
                {emailPromptBusy ? 'Saving…' : 'Save with email'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={saveLocallyOnly}
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#1a1a2e', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
              >
                Save on this device only
              </button>
              <button
                type="button"
                onClick={() => setShowEmailPrompt(false)}
                style={{ background: 'transparent', border: 'none', color: '#999', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
