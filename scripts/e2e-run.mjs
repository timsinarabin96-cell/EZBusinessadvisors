/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// E2E seed + smoke — one-shot: seed the QA account, then run Playwright.
// Usage: node scripts/e2e-run.mjs   (or just run the two steps manually)
// =============================================================================

import { spawnSync } from 'node:child_process'

console.log('── Step 1/2: seed test account ──')
const seed = spawnSync('node', ['scripts/seed-e2e-user.mjs'], { stdio: 'inherit', shell: true })
if (seed.status !== 0) {
  console.error('Seeding failed — continuing anyway (auth tests will show a clear note).')
}

console.log('── Step 2/2: run Playwright E2E ──')
const pw = spawnSync('npx', ['playwright', 'test'], { stdio: 'inherit', shell: true })
process.exit(pw.status ?? 1)
