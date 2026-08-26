/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

// =============================================================================
// HomeSearchCategory — autocomplete category field for the homepage hero form.
// Mirrors AutocompleteInput (type=category) into a hidden <input name="industry">
// so the zero-JS GET form still submits the picked value. Type "R" → Retail,
// Restaurant, Real Estate… select from the dropdown.
// =============================================================================

import { useEffect, useState } from 'react'
import AutocompleteInput from './AutocompleteInput'

export default function HomeSearchCategory({ style }: { style?: React.CSSProperties }) {
  const [cat, setCat] = useState('')

  // Sync into the hidden form field so the GET form carries the value.
  useEffect(() => {
    const hidden = document.querySelector<HTMLInputElement>('input[name="industry"]')
    if (hidden) hidden.value = cat
  }, [cat])

  return (
    <>
      <AutocompleteInput type="category" value={cat} onChange={setCat} placeholder="Category (e.g. Retail, Restaurant)…" style={style} />
      <input type="hidden" name="industry" value={cat} />
    </>
  )
}
