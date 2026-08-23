import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function parseEnv(source) {
  return Object.fromEntries(source
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=')
      const key = line.slice(0, index).trim()
      let value = line.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      return [key, value]
    }))
}

const outputPath = process.argv[2]
if (!outputPath) throw new Error('Usage: node scripts/snapshot-supabase-schema.mjs OUTPUT_PATH')

const env = parseEnv(await readFile('.env.local', 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required')

const response = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
})
if (!response.ok) throw new Error(`Schema request failed with ${response.status}`)

const openApi = await response.json()
const definitions = openApi.definitions || openApi.components?.schemas || {}
const snapshot = {
  capturedAt: new Date().toISOString(),
  projectRef: new URL(url).hostname.split('.')[0],
  tables: Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [name, {
    required: definition.required || [],
    columns: Object.fromEntries(Object.entries(definition.properties || {}).map(([column, details]) => [column, {
      type: details.type || null,
      format: details.format || null,
      description: details.description || null,
    }])),
  }])),
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 })
console.log(JSON.stringify({ outputPath, tableCount: Object.keys(snapshot.tables).length, projectRef: snapshot.projectRef }))
