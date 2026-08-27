/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

'use client'

import { useEffect, useRef, useState } from 'react'

// =============================================================================
// useStepAutoSave — debounced auto-save for the workflow steps (Verify phase).
// Saves the step's local form values ~1.2s after the last change, WITHOUT
// completing the step or advancing (the explicit "Step X complete →" button
// still owns progression). The first render after load becomes the baseline
// and is never re-saved, so opening a step never writes junk rows.
//
// Returns 'idle' | 'saving' | 'saved' | 'error' for a UI indicator.
// =============================================================================

export function useStepAutoSave<T>(
  value: T,
  save: (v: T) => Promise<boolean>,
  enabled = true,
  delay = 1200,
): 'idle' | 'saving' | 'saved' | 'error' {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSnapshot = useRef<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const snap = JSON.stringify(value)
    // First run once loaded: this is the baseline fetched from the DB — never
    // save it back (avoids duplicate recast/closing rows on every open).
    if (!initialized.current) {
      initialized.current = true
      lastSnapshot.current = snap
      return
    }
    if (snap === lastSnapshot.current) return

    const timer = setTimeout(async () => {
      setState('saving')
      const ok = await save(value)
      if (ok) {
        lastSnapshot.current = snap
        setState('saved')
      } else {
        setState('error')
      }
    }, delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled])

  return state
}
