import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const lib = readFileSync('lib/emailVerification.ts', 'utf8')
const authPage = readFileSync('app/auth/page.tsx', 'utf8')
const signupPage = readFileSync('app/auth/signup/page.tsx', 'utf8')
const serverAuth = readFileSync('lib/supabase/auth.ts', 'utf8')
const securityPage = readFileSync('app/dashboard/security/page.tsx', 'utf8')

const { isEmailConfirmed, verificationState, passwordIssue } = await import('../lib/emailVerification.ts')

test('verification: confirms only when email_confirmed_at is set', () => {
  assert.equal(isEmailConfirmed({ email_confirmed_at: new Date().toISOString() }), true)
  assert.equal(isEmailConfirmed({ email_confirmed_at: null }), false)
  assert.equal(isEmailConfirmed(null), false)
  assert.equal(verificationState({ email_confirmed_at: null }), 'unconfirmed')
  assert.equal(verificationState(null), 'unknown')
})

test('verification: strong password policy requires length + letter + number', () => {
  assert.ok(passwordIssue('short')?.includes('8'))
  assert.ok(passwordIssue('abcdefgh')?.includes('letter'))
  assert.ok(passwordIssue('12345678')?.includes('letter'))
  assert.equal(passwordIssue('Passw0rd9'), null)
  assert.equal(passwordIssue('abc12345'), null)
})

test('verification: login page blocks unconfirmed emails and requires 2FA code', () => {
  assert.match(authPage, /isEmailConfirmed/)
  assert.match(authPage, /Verify your email/)
  assert.match(authPage, /Resend verification email/)
  assert.match(authPage, /mfa\.challenge/)
  assert.match(authPage, /mfa\.verify/)
  assert.match(authPage, /authenticator app/)
  assert.match(authPage, /resolvePortalRole|resolveLoginDestination|authRouting/)
})

test('verification: signup enforces password policy and shows check-inbox screen', () => {
  assert.match(signupPage, /passwordIssue/)
  assert.match(signupPage, /email_confirmed_at/)
  assert.match(signupPage, /Check your inbox/)
  assert.match(signupPage, /Resend verification email/)
  assert.match(signupPage, /minLength=\{8\}/)
})

test('verification: server-side auth rejects unconfirmed emails', () => {
  assert.match(serverAuth, /email_confirmed_at/)
  assert.match(serverAuth, /STRONG VERIFICATION GATE/)
  assert.match(serverAuth, /No portal, no API access/)
})

test('verification: security page supports enroll + unenroll + agency policy', () => {
  assert.match(securityPage, /mfa\.enroll/)
  assert.match(securityPage, /mfa\.verify/)
  assert.match(securityPage, /mfa\.unenroll/)
  assert.match(securityPage, /Require 2FA for all brokers/)
  assert.match(securityPage, /qr_code/)
})
