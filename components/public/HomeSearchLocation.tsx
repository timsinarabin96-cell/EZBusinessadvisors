'use client'

// =============================================================================
// HomeSearchLocation — autocomplete location field for the homepage hero form.
// The homepage search is a plain GET form (zero-JS friendly), so this client
// wrapper renders the smart AutocompleteInput and mirrors the picked value
// into a hidden <input name="location"> that the form submits.
// =============================================================================

import { useEffect, useState } from 'react'
import AutocompleteInput from './AutocompleteInput'

export default function HomeSearchLocation({ style }: { style?: React.CSSProperties }) {
  const [loc, setLoc] = useState('')

  // Sync into the hidden form field so the GET form carries the value.
  useEffect(() => {
    const hidden = document.querySelector<HTMLInputElement>('input[name="location"]')
    if (hidden) hidden.value = loc
  }, [loc])

  return (
    <>
      <AutocompleteInput type="location" value={loc} onChange={setLoc} placeholder="Location" style={style} />
      <input type="hidden" name="location" value={loc} />
    </>
  )
}
