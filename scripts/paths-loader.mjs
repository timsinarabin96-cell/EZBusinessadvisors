// Node loader hooks: resolve '@/...' path aliases so server libs can run
// under `node --experimental-strip-types` (unit-test / sample-gen scripts).
// Usage: node --import ./scripts/paths-loader.mjs --experimental-strip-types scripts/x.mts
import { register } from 'node:module'
register('./paths-hooks.mjs', import.meta.url)
