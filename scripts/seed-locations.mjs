/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Seed US locations (cities, counties, states) into public.locations
// Usage: node scripts/seed-locations.mjs
// -----------------------------------------------------------------------------
// Reads .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
// Downloads the kelvins/US-Cities-Database dataset (fallback: grammakov,
// then a small hardcoded list), builds city/county/state rows and UPSERTs
// them in batches of 500. Idempotent — safe to re-run.
//
// If public.locations is missing it tries to apply sql/locations_schema.sql
// via the Supabase Management API (project ref parsed from the env URL,
// token read from ~/.supabase/access-token). If that fails it prints a clear
// warning and exits non-zero.
// =============================================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const BATCH_SIZE = 500
const CITY_CAP = 40_000
const CACHE_FILE = join(tmpdir(), 'concord_us_cities.csv')
const SCHEMA_FILE = 'sql/locations_schema.sql'
const DATASET_URLS = [
  'https://raw.githubusercontent.com/kelvins/US-Cities-Database/main/csv/us_cities.csv',
  'https://raw.githubusercontent.com/grammakov/USA-cities-and-states/master/us_cities_states_counties.csv',
]
// Last-resort fallback data (only used if both datasets are unreachable).
const FALLBACK_STATES = [
  ['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],
  ['Colorado','CO'],['Connecticut','CT'],['Delaware','DE'],['District of Columbia','DC'],
  ['Florida','FL'],['Georgia','GA'],['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],
  ['Indiana','IN'],['Iowa','IA'],['Kansas','KS'],['Kentucky','KY'],['Louisiana','LA'],
  ['Maine','ME'],['Maryland','MD'],['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],
  ['Mississippi','MS'],['Missouri','MO'],['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],
  ['New Hampshire','NH'],['New Jersey','NJ'],['New Mexico','NM'],['New York','NY'],
  ['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],['Oklahoma','OK'],['Oregon','OR'],
  ['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],['South Dakota','SD'],
  ['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],['Virginia','VA'],
  ['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY'],['Puerto Rico','PR'],
]
// "City,ST" entries for the hardcoded fallback (includes the autocomplete
// test targets: Harrisburg PA, Hershey PA, Harris County TX).
const FALLBACK_CITIES = [
  'Harrisburg,PA','Hershey,PA','Pittsburgh,PA','Philadelphia,PA','Allentown,PA','Erie,PA',
  'Scranton,PA','Reading,PA','Bethlehem,PA','Lancaster,PA','York,PA','State College,PA',
  'New York,NY','Buffalo,NY','Rochester,NY','Syracuse,NY','Albany,NY','Ithaca,NY',
  'Boston,MA','Worcester,MA','Springfield,MA','Cambridge,MA','Hartford,CT','New Haven,CT',
  'Stamford,CT','Providence,RI','Newark,NJ','Jersey City,NJ','Trenton,NJ','Atlantic City,NJ',
  'Washington,DC','Baltimore,MD','Annapolis,MD','Richmond,VA','Virginia Beach,VA','Norfolk,VA',
  'Charlottesville,VA','Atlanta,GA','Savannah,GA','Augusta,GA','Macon,GA','Miami,FL',
  'Tampa,FL','Orlando,FL','Jacksonville,FL','Tallahassee,FL','Gainesville,FL','Charlotte,NC',
  'Raleigh,NC','Greensboro,NC','Asheville,NC','Wilmington,NC','Columbia,SC','Charleston,SC',
  'Greenville,SC','Nashville,TN','Memphis,TN','Knoxville,TN','Chattanooga,TN','Birmingham,AL',
  'Mobile,AL','Montgomery,AL','Huntsville,AL','New Orleans,LA','Baton Rouge,LA','Shreveport,LA',
  'Louisville,KY','Lexington,KY','Frankfort,KY','Cincinnati,OH','Columbus,OH','Cleveland,OH',
  'Toledo,OH','Dayton,OH','Detroit,MI','Grand Rapids,MI','Ann Arbor,MI','Lansing,MI',
  'Indianapolis,IN','Fort Wayne,IN','South Bend,IN','Bloomington,IN','Chicago,IL','Springfield,IL',
  'Peoria,IL','Rockford,IL','Milwaukee,WI','Madison,WI','Green Bay,WI','Minneapolis,MN',
  'St. Paul,MN','Duluth,MN','Des Moines,IA','Cedar Rapids,IA','Kansas City,MO','St. Louis,MO',
  'Springfield,MO','Omaha,NE','Lincoln,NE','Wichita,KS','Topeka,KS','Tulsa,OK','Oklahoma City,OK',
  'Norman,OK','Dallas,TX','Houston,TX','Austin,TX','San Antonio,TX','Fort Worth,TX',
  'El Paso,TX','Lubbock,TX','Amarillo,TX','Denver,CO','Colorado Springs,CO','Boulder,CO',
  'Salt Lake City,UT','Provo,UT','Phoenix,AZ','Tucson,AZ','Mesa,AZ','Las Vegas,NV',
  'Reno,NV','Albuquerque,NM','Santa Fe,NM','Boise,ID','Billings,MT','Missoula,MT',
  'Cheyenne,WY','Casper,WY','Portland,OR','Salem,OR','Eugene,OR','Seattle,WA','Spokane,WA',
  'Tacoma,WA','Olympia,WA','Anchorage,AK','Fairbanks,AK','Honolulu,HI','Hilo,HI',
  'San Francisco,CA','Los Angeles,CA','San Diego,CA','Sacramento,CA','San Jose,CA',
  'Fresno,CA','Bakersfield,CA','Oakland,CA','Long Beach,CA','San Juan,PR',
]
// "CountyName,ST" entries for the hardcoded fallback.
const FALLBACK_COUNTIES = [
  'Harris,TX','Dallas,TX','Tarrant,TX','Travis,TX','Bexar,TX','Los Angeles,CA','San Diego,CA',
  'Orange,CA','Cook,IL','King,WA','Maricopa,AZ','Clark,NV','Miami-Dade,FL','Broward,FL',
  'Allegheny,PA','Philadelphia,PA','Montgomery,PA','Dauphin,PA','Lancaster,PA','New York,NY',
  'Kings,NY','Queens,NY','Bronx,NY','Suffolk,NY','Wayne,MI','Cuyahoga,OH','Franklin,OH',
  'Hamilton,OH','Fulton,GA','DeKalb,GA','Mecklenburg,NC','Wake,NC','Fairfax,VA',
  'Prince Georges,MD','Montgomery,MD','Baltimore,MD','Suffolk,MA','Middlesex,MA',
]

// ---------------------------------------------------------------------------
// Env + client
// ---------------------------------------------------------------------------
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

const env = parseEnv(await readFile('.env.local', 'utf8'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service-role key are required in .env.local')
const db = createClient(url, serviceKey, { auth: { persistSession: false } })

// ---------------------------------------------------------------------------
// DDL via Supabase Management API (only path available for CREATE TABLE)
// ---------------------------------------------------------------------------
async function applyDdl() {
  const ddl = await readFile(SCHEMA_FILE, 'utf8')
  const tokenFile = join(homedir(), '.supabase', 'access-token')
  if (!existsSync(tokenFile)) throw new Error(`no management token at ${tokenFile}`)
  const token = (await readFile(tokenFile, 'utf8')).trim()
  const ref = new URL(url).hostname.split('.')[0]
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: ddl }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`management API ${res.status}: ${(await res.text()).slice(0, 500)}`)
  // Refresh the PostgREST schema cache so the new table is visible.
  await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" }),
    signal: AbortSignal.timeout(60_000),
  })
  console.log('  applied', SCHEMA_FILE, 'via Management API + reloaded PostgREST cache')
}

async function ensureTable() {
  const { error } = await db.from('locations').select('id').limit(1)
  if (!error) return true
  if (error.code !== 'PGRST205') throw new Error(`unexpected locations check error: ${error.message}`)
  console.log('Table public.locations is MISSING — attempting DDL via Management API…')
  try {
    await applyDdl()
  } catch (e) {
    console.error(`\nTABLE MISSING — could not create it automatically (${e.message}).`)
    console.error(`Run sql/locations_schema.sql in the Supabase SQL Editor, then re-run this script.`)
    process.exit(1)
  }
  const re = await db.from('locations').select('id').limit(1)
  if (re.error) {
    console.error(`\nTABLE MISSING — run sql/locations_schema.sql in the Supabase SQL Editor, then re-run.`)
    process.exit(1)
  }
  return true
}

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------
async function fetchCsv() {
  if (existsSync(CACHE_FILE)) {
    console.log(`Using cached dataset: ${CACHE_FILE}`)
    return readFile(CACHE_FILE, 'utf8')
  }
  for (const source of DATASET_URLS) {
    console.log(`Downloading dataset: ${source}`)
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(90_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      await mkdir(tmpdir(), { recursive: true })
      await writeFile(CACHE_FILE, text)
      console.log(`  cached to ${CACHE_FILE}`)
      return text
    } catch (e) {
      console.warn(`  failed: ${e.message}`)
    }
  }
  return null
}

// Parse either known CSV shape (kelvins: ID,STATE_CODE,STATE_NAME,CITY,COUNTY,
// LATITUDE,LONGITUDE | grammakov: city,state_id,state_name,county_name,lat,lng,population).
function parseRows(text) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  if (parsed.errors.some((e) => e.type === 'Delimiter' || e.type === 'FieldMismatch')) {
    console.warn(`CSV parse warnings: ${parsed.errors.length}`)
  }
  const pick = (row, names) => {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== '') return String(row[n]).trim()
    }
    return null
  }
  const rows = []
  for (const raw of parsed.data) {
    const city = pick(raw, ['CITY', 'city', 'name', 'City'])
    const county = pick(raw, ['COUNTY', 'county_name', 'County'])
    const stateCode = pick(raw, ['STATE_CODE', 'state_id', 'state'])
    const stateName = pick(raw, ['STATE_NAME', 'state_name'])
    const lat = pick(raw, ['LATITUDE', 'lat'])
    const lng = pick(raw, ['LONGITUDE', 'lng'])
    const population = pick(raw, ['population', 'Population'])
    if (!city || !stateCode) continue
    rows.push({
      city, county: county || null, stateCode: stateCode.toUpperCase(),
      stateName: stateName || null, lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null, population: population ? Number(population) : null,
    })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Row building
// ---------------------------------------------------------------------------
const COUNTY_SUFFIXES = /(county|parish|borough|city|municipio|district)$/i
function countyDisplayName(county, stateCode) {
  const base = county.replace(/\s+/g, ' ').trim()
  if (COUNTY_SUFFIXES.test(base)) return base
  if (stateCode === 'AK') return `${base} Borough`
  if (stateCode === 'LA') return `${base} Parish`
  if (stateCode === 'DC') return base
  return `${base} County`
}

function buildRows(records) {
  const cities = new Map() // key -> row
  const counties = new Map()
  const states = new Map()
  for (const r of records) {
    // Cities
    const cityKey = `${r.city.toLowerCase()}|${r.stateCode}|city`
    if (!cities.has(cityKey) && cities.size < CITY_CAP) {
      cities.set(cityKey, {
        name: r.city, state_code: r.stateCode, state_name: r.stateName,
        place_type: 'city', display: `${r.city}, ${r.stateCode}`,
        population: r.population, lat: r.lat, lng: r.lng,
      })
    }
    // Counties (unique per state)
    if (r.county) {
      const cName = countyDisplayName(r.county, r.stateCode)
      const cKey = `${cName.toLowerCase()}|${r.stateCode}|county`
      if (!counties.has(cKey)) {
        counties.set(cKey, {
          name: cName, state_code: r.stateCode, state_name: r.stateName,
          place_type: 'county', display: `${cName}, ${r.stateCode}`,
          population: null, lat: r.lat, lng: r.lng,
        })
      }
    }
    // States
    const sKey = r.stateCode
    if (!states.has(sKey) && r.stateName) {
      states.set(sKey, {
        name: r.stateName, state_code: r.stateCode, state_name: r.stateName,
        place_type: 'state', display: r.stateName, population: null, lat: null, lng: null,
      })
    }
  }
  return { cities: [...cities.values()], counties: [...counties.values()], states: [...states.values()] }
}

function fallbackRows() {
  const records = []
  for (const [stateName, stateCode] of FALLBACK_STATES) {
    records.push({ city: stateName, county: null, stateCode, stateName, lat: null, lng: null, population: null })
  }
  for (const entry of FALLBACK_CITIES) {
    const [city, stateCode] = entry.split(',')
    const stateName = (FALLBACK_STATES.find(([, sc]) => sc === stateCode) || [null, stateCode])[0]
    records.push({ city, county: null, stateCode, stateName, lat: null, lng: null, population: null })
  }
  for (const entry of FALLBACK_COUNTIES) {
    const [county, stateCode] = entry.split(',')
    const stateName = (FALLBACK_STATES.find(([, sc]) => sc === stateCode) || [null, stateCode])[0]
    records.push({ city: null, county, stateCode, stateName, lat: null, lng: null, population: null })
  }
  return buildRows(records)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log('== Seed US locations ==')
await ensureTable()

let csv = await fetchCsv()
let source = 'dataset'
if (!csv) {
  console.warn('Both datasets unreachable — using hardcoded fallback (~150 cities + states + counties).')
  source = 'fallback'
}
const rows = csv ? buildRows(parseRows(csv)) : fallbackRows()
const all = [...rows.cities, ...rows.counties, ...rows.states]
console.log(`Built ${all.length} rows: ${rows.cities.length} cities (cap ${CITY_CAP}), ${rows.counties.length} counties, ${rows.states.length} states (source: ${source})`)

let ok = 0
let failed = 0
for (let i = 0; i < all.length; i += BATCH_SIZE) {
  const batch = all.slice(i, i + BATCH_SIZE)
  const { error } = await db.from('locations').upsert(batch, { onConflict: 'name,state_code,place_type' })
  if (error) {
    failed += batch.length
    console.error(`  batch ${i / BATCH_SIZE + 1} FAILED: ${error.message}`)
  } else {
    ok += batch.length
  }
  if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= all.length) {
    console.log(`  upserted ${ok} / ${all.length}…`)
  }
}

if (failed > 0) {
  console.error(`\nDONE with ${failed} rows failing to upsert.`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
const { count, error: cntErr } = await db.from('locations').select('*', { count: 'exact', head: true })
console.log('\n== Verification ==')
console.log('Total rows in public.locations:', cntErr ? `ERROR ${cntErr.message}` : count)
const { data: sample, error: sampleErr } = await db
  .from('locations').select('display, state_code, place_type').ilike('name', 'har%').limit(8)
console.log('Suggestions for "har%":')
if (sampleErr) {
  console.error('  ERROR', sampleErr.message)
} else {
  for (const s of sample) console.log(`  ${s.display}  [${s.place_type}]`)
}
console.log('\nSeed complete. Re-running is safe (idempotent).')
