/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

import { redirect } from 'next/navigation'

// =============================================================================
// /dashboard/listings/[id]/workflow — DEPRECATED standalone page.
// The 10-step workflow now lives INSIDE the AI Deal Studio (Verify phase).
// This route is kept only for deep links / bookmarks — it routes straight
// into the same continuous canvas.
// =============================================================================

export default async function WorkflowPageRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/dashboard/studio?phase=verify&listing=${id}&step=1`)
}
