import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

// =============================================================================
// Deal Room — role-based access + due-diligence template (Phase 1).
// Static + fast: verifies the server lib exports the DD template with access
// levels, the role→visibility matrix, and that the room API wires the new
// actions (restore / move / set access) with agent-only guards.
// =============================================================================

const serverLib = readFileSync('lib/dataRoomServer.ts', 'utf8')
const roomRoute = readFileSync('app/api/data-rooms/room/route.ts', 'utf8')

test('dealRoom: DD template has the standard due-diligence folders', () => {
  for (const folder of ['Financials', 'Legal', 'Operations', 'HR & Employees', 'Real Estate & Lease', 'Insurance', 'Contracts', 'Tax Returns', 'Intellectual Property']) {
    assert.ok(serverLib.includes(`name: '${folder}'`), `missing DD folder ${folder}`)
  }
  // Internal agent-only folder exists (permissions demo).
  assert.match(serverLib, /Internal \(Agent Only\)/)
})

test('dealRoom: folders/files carry access_level + uploaded_by_role', () => {
  assert.match(serverLib, /access: RoomAccessLevel/)
  assert.match(serverLib, /uploaded_by_role/)
  // API stores the uploader role on insert.
  assert.match(roomRoute, /uploaded_by_role: role/)
})

test('dealRoom: role visibility matrix — agent all, buyer/seller scoped', () => {
  assert.match(serverLib, /if \(role === 'agent'\) return \['all_parties', 'buyer_only', 'seller_only', 'agent_only'\]/)
  assert.match(serverLib, /if \(role === 'buyer'\) return \['all_parties', 'buyer_only'\]/)
  assert.match(serverLib, /return \['all_parties', 'seller_only'\]/)
})

test('dealRoom: restore_file and access setters are agent-only', () => {
  assert.match(roomRoute, /if \(action === 'restore_file'\)/)
  assert.match(roomRoute, /if \(role !== 'agent'\) return NextResponse\.json\(\{ ok: false, error: 'Agents only' \}, \{ status: 403 \}\)/)
  assert.match(roomRoute, /if \(action === 'set_file_access'\)/)
  assert.match(roomRoute, /if \(action === 'set_folder_access'\)/)
  assert.match(roomRoute, /if \(action === 'move_file'\)/)
})

test('dealRoom: portal users cannot upload into folders their role cannot see', () => {
  assert.match(roomRoute, /You cannot upload into that folder/)
  assert.match(roomRoute, /visibleAccessLevels\(role\)\.includes/)
})

test('dealRoom: old flat Documents hub is gone, Deal Room pages exist', () => {
  assert.throws(() => readFileSync('app/documents/page.tsx', 'utf8'))
  assert.ok(readFileSync('app/dashboard/deal-room/page.tsx', 'utf8').includes('Deal Room'))
  assert.ok(readFileSync('app/dashboard/deal-room/[dealId]/page.tsx', 'utf8').includes('DealRoom'))
})
