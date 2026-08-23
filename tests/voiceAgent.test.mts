import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const agent = readFileSync('lib/voiceAgent.ts', 'utf8')
const twilio = readFileSync('app/api/voice/twilio/route.ts', 'utf8')

test('phone agent detects booking, sell, and buy intents', () => {
  assert.match(agent, /CallIntent/)
  assert.match(agent, /'book' \| 'sell' \| 'buy' \| 'general' \| 'unknown'/)
  assert.match(agent, /bookingHints/)
  assert.match(agent, /timeHints/)
})

test('phone agent keeps replies short for spoken turns', () => {
  assert.match(agent, /under 30 words per turn/)
  assert.match(agent, /one question at a time/)
})

test('phone agent never leaks confidential deal details', () => {
  assert.match(agent, /Never reveal confidential deal details/)
  assert.match(agent, /GOODBYE/)
})

test('phone agent books real appointments from calls', () => {
  assert.match(agent, /extractBooking/)
  assert.match(agent, /needs_confirmation/)
  assert.match(agent, /Appointment details captured/)
})

test('twilio webhook returns TwiML and speaks replies', () => {
  assert.match(twilio, /twiml\(/)
  assert.match(twilio, /<Gather input="speech"/)
  assert.match(twilio, /<Hangup\/>/)
  assert.match(twilio, /Polly\.Joanna/)
})

test('twilio webhook records transcripts and creates bookings', () => {
  assert.match(twilio, /call_transcripts/)
  assert.match(twilio, /createBooking\(/)
  assert.match(twilio, /source: 'ai_phone'/)
})

test('voice agent requires agency configuration', () => {
  assert.match(twilio, /VOICE_AGENT_AGENCY_ID/)
  assert.match(twilio, /Voice agent is not configured for an agency/)
})
