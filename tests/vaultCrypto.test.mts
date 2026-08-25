import assert from 'node:assert/strict'
import test from 'node:test'

const { encryptSecret, decryptSecret } = await import('../lib/vaultCrypto.ts')

test('vault crypto: round-trips a password', async () => {
  process.env.VAULT_ENCRYPTION_KEY = 'test-vault-key-1234567890'
  const enc = await encryptSecret('Hunter2!secret')
  assert.notEqual(enc, 'Hunter2!secret')
  assert.ok(enc.length > 20)
  const dec = await decryptSecret(enc)
  assert.equal(dec, 'Hunter2!secret')
})

test('vault crypto: same plaintext yields different ciphertext (random IV)', async () => {
  process.env.VAULT_ENCRYPTION_KEY = 'test-vault-key-1234567890'
  const a = await encryptSecret('same-password')
  const b = await encryptSecret('same-password')
  assert.notEqual(a, b)
})

test('vault crypto: tampered payload throws (integrity check)', async () => {
  process.env.VAULT_ENCRYPTION_KEY = 'test-vault-key-1234567890'
  const enc = await encryptSecret('keep-it-secret')
  const raw = Buffer.from(enc, 'base64')
  raw[raw.length - 1] = raw[raw.length - 1] ^ 0xff
  await assert.rejects(() => decryptSecret(raw.toString('base64')))
})

test('vault crypto: short/garbage payload throws', async () => {
  await assert.rejects(() => decryptSecret('notbase64!!'))
  await assert.rejects(() => decryptSecret(''))
})
