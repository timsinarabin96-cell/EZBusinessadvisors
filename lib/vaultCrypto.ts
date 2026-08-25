// =============================================================================
// vaultCrypto — AES-256-GCM encryption for saved passwords.
// Pure + dependency-free (Web Crypto, available in Node 20+ and browsers), so
// it is unit-testable. The key is derived from a server-side secret so the
// plaintext key never ships to the browser; /api/vault is the only decryptor.
// =============================================================================

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * Derive a 32-byte AES-256 key from the server secret.
 * Falls back to a stable derivation of the service-role key when no explicit
 * VAULT_ENCRYPTION_KEY is set — still server-only, never exposed to clients.
 */
export function vaultKeyMaterial(): string {
  const explicit = process.env.VAULT_ENCRYPTION_KEY
  if (explicit && explicit.length >= 16) return explicit
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || 'concord-vault-dev-key'
  return `concord-vault:${srk}`
}

async function importKey(material: string): Promise<CryptoKey> {
  const data = encoder.encode(material)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Encrypt a plaintext password → base64(iv || ciphertext). */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importKey(vaultKeyMaterial())
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext))
  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)
  return Buffer.from(combined).toString('base64')
}

/** Decrypt base64(iv || ciphertext) → plaintext password. Throws on tamper. */
export async function decryptSecret(payload: string): Promise<string> {
  const key = await importKey(vaultKeyMaterial())
  const raw = Buffer.from(payload, 'base64')
  if (raw.length < 13) throw new Error('invalid vault payload')
  const iv = raw.subarray(0, 12)
  const cipher = raw.subarray(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return decoder.decode(plain)
}
