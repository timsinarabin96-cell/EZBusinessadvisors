/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// HomeSearchKeyword — autocomplete keyword field for the homepage hero form.
// Mirrors AutocompleteInput (type=keyword → Universal business taxonomy) into a
// hidden <input name="q"> so the zero-JS GET form still submits the picked
// value. Type "R" → Retail, Restaurant, Roofing, Real Estate… even when there
// are zero live listings (taxonomy-backed, not listing-derived).
// =============================================================================

import { useEffect, useState } from 'react'
import AutocompleteInput from './AutocompleteInput'

export default function HomeSearchKeyword({ style }: { style?: React.CSSProperties }) {
  const [kw, setKw] = useState('')

  // Sync into the hidden form field so the GET form carries the value.
  useEffect(() => {
    const hidden = document.querySelector<HTMLInputElement>('input[name="q"]')
    if (hidden) hidden.value = kw
  }, [kw])

  return (
    <>
      <AutocompleteInput type="keyword" value={kw} onChange={setKw} placeholder="Keyword (restaurant, HVAC…)" style={style} />
      <input type="hidden" name="q" value={kw} />
    </>
  )
}
