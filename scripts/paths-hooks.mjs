// Resolve hooks: map '@/...' to the repo root so libs can be imported under
// plain node (--experimental-strip-types). Paired with paths-loader.mjs.
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    let p = path.join(ROOT, rel)
    if (!existsSync(p) && existsSync(p + '.ts')) p = p + '.ts'
    if (!existsSync(p) && existsSync(p + '.mts')) p = p + '.mts'
    return { url: pathToFileURL(p).href, shortCircuit: true }
  }
  return next(specifier, context)
}
