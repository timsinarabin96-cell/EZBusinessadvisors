import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const agent = readFileSync('lib/voiceAgent.ts', 'utf8')
const twilio = readFileSync('app/api/voice/twilio/route.ts', 'utf8')

test('phone agent is a professional receptionist', () => {
  assert.match(agent, /receptionist at EZ Business Advisors/)
  assert.match(agent, /real, polished human front-desk person/)
})

test('phone agent listens first and confirms briefly', () => {
  assert.match(agent, /LISTEN FIRST/)
  assert.match(agent, /CONFIRM it briefly/)
  assert.match(agent, /Got it, Sarah — a broker will call you back shortly/)
})

test('phone agent keeps replies to one short sentence', () => {
  assert.match(agent, /AT MOST ONE short sentence/)
  assert.match(agent, /Under 15 words/)
  assert.match(agent, /NEVER recap, summarize, or repeat back/)
})

test('phone agent never leaks confidential deal details', () => {
  assert.match(agent, /Never reveal confidential deal details/)
  assert.match(agent, /GOODBYE/)
})

test('phone agent confirms buying, selling, and booking professionally', () => {
  assert.match(agent, /buyer's broker will call you back/)
  assert.match(agent, /a broker will call you back to go over it confidentially/)
})

test('phone agent asks for name and callback number only when missing', () => {
  assert.match(agent, /Only ask for something you don't have yet/)
  assert.match(agent, /their name, or a callback number/)
})

test('twilio webhook uses a natural human voice (Polly.Matthew)', () => {
  assert.match(twilio, /Polly\.Matthew/)
  assert.match(twilio, /<Gather input="speech"/)
  assert.match(twilio, /<Hangup\/>/)
})

test('twilio webhook greets professionally and records transcripts', () => {
  assert.match(twilio, /Good \$\{dayPart\(\)\}/)
  assert.match(twilio, /call_transcripts/)
  assert.match(twilio, /VOICE_AGENT_AGENCY_ID/)
})

test('voice agent requires agency configuration', () => {
  assert.match(twilio, /Voice agent is not configured for an agency/)
})
