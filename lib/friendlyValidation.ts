/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Friendly validation errors — shared across the CRM and the public website.
// -----------------------------------------------------------------------------
// Every "Validation failed" becomes a human sentence: what's wrong, what to
// provide, and (where useful) what to tap next. Client components compose
// `j.error || j.detail` — this module gives the server side consistent,
// readable messages so the browser never shows a bare Zod error again.
// =============================================================================

import type { ZodError } from 'zod'

/** Build a human-readable validation error from a Zod failure. */
export function friendlyValidationError(
  zod: ZodError,
  opts?: {
    /** What the user was trying to do, e.g. "save the offer". */
    action?: string
    /** Short hint appended when we can't map the issue. */
    fallback?: string
  },
): { error: string; detail?: string } {
  const issue = zod.issues[0]
  const action = opts?.action ? `${opts.action}: ` : ''
  const rawDetail = issue?.message || ''

  // Map common Zod codes to plain language.
  let friendly: string
  switch (issue?.code) {
    case 'too_small':
      friendly = `${action}Add more detail — that field needs at least ${issue.minimum ?? 'more'} character${(issue.minimum ?? 2) > 1 ? 's' : ''}.`
      break
    case 'too_big':
      friendly = `${action}That input is too long (max ${issue.maximum ?? 'allowed'} character${(issue.maximum ?? 2) > 1 ? 's' : ''}). Shorten it and try again.`
      break
    case 'invalid_type':
      friendly = `${action}That field needs a ${issue.expected ?? 'valid'} value — check what you entered and try again.`
      break
    case 'invalid_format':
      friendly = `${action}That doesn't look right (expected ${'format' in issue && issue.format ? String(issue.format) : 'a valid format'}). Double-check and try again.`
      break
    case 'unrecognized_keys':
      friendly = `${action}Some fields weren't recognized. Remove extras and try again.`
      break
    default:
      friendly = `${action}${rawDetail || 'One of the fields is missing or invalid.'}`
      break
  }

  // Append the specific field when we know it (path like ["notes"] or ["offerId"]).
  const field = issue?.path?.length ? String(issue.path[issue.path.length - 1]) : ''
  if (field) {
    friendly += ` (field: ${field})`
  }

  return { error: friendly, detail: rawDetail || undefined }
}

/** Shortcut for route handlers: `return validationError(zodError)` → 422 JSON. */
export function validationErrorJson(zod: ZodError, opts?: { action?: string; fallback?: string }) {
  const { error, detail } = friendlyValidationError(zod, opts)
  return { ok: false as const, error, detail }
}
