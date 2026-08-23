import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync('sql/email_templates_schema.sql', 'utf8')
const lib = readFileSync('lib/emailTemplates.ts', 'utf8')
const route = readFileSync('app/api/email-templates/route.ts', 'utf8')
const sendRoute = readFileSync('app/api/email-templates/send/route.ts', 'utf8')
const page = readFileSync('app/dashboard/email-templates/page.tsx', 'utf8')

test('templates: schema creates email_templates + seeds standard library', () => {
  assert.match(schema, /create table if not exists public\.email_templates/)
  assert.match(schema, /unique \(agency_id, name\)/)
  assert.match(schema, /seed_email_templates/)
  assert.match(schema, /Initial introduction/)
  assert.match(schema, /NDA follow-up/)
  assert.match(schema, /Offer presentation/)
  assert.match(schema, /Counter-offer/)
  assert.match(schema, /Seller valuation follow-up/)
  assert.match(schema, /is_agency_member\(agency_id\)/)
})

test('templates: lib renders {{variables}} and sends via queue', () => {
  assert.match(lib, /export async function listTemplates/)
  assert.match(lib, /export async function saveTemplate/)
  assert.match(lib, /export async function deleteTemplate/)
  assert.match(lib, /export function renderTemplate/)
  assert.match(lib, /export async function sendTemplate/)
  assert.match(lib, /\\\{\\\{\(\\w\+\)\\\}\\\}/)
  assert.match(lib, /System templates cannot be deleted/)
  assert.match(lib, /notify\('generic'/)
})

test('templates: API supports CRUD + send with auth', () => {
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PATCH/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /action === 'seed'/)
  assert.match(sendRoute, /export async function POST/)
  assert.match(sendRoute, /sendTemplate/)
  assert.match(sendRoute, /Insufficient permission/)
})

test('templates: dashboard page has list, editor, live preview', () => {
  assert.match(page, /Email Template Library/)
  assert.match(page, /Restore standard library/)
  assert.match(page, /New template/)
  assert.match(page, /previewSubject/)
  assert.match(page, /\/api\/email-templates/)
})
