import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM for cloud credentials at rest. GCM is authenticated, so a
 * tampered ciphertext fails to decrypt instead of returning garbage.
 *
 * Key: AWS_CREDENTIAL_ENCRYPTION_KEY, 32 random bytes, base64.
 * Generate one with: openssl rand -base64 32
 */

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12

function encryptionKey(): Buffer {
  // TISIOPS_ENCRYPTION_KEY is the general name; the AWS one is the original
  // and stays supported so existing rows keep decrypting.
  const raw =
    process.env.TISIOPS_ENCRYPTION_KEY ??
    process.env.AWS_CREDENTIAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "TISIOPS_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32"
    )
  }

  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(
      "AWS_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32 random bytes)"
    )
  }

  return key
}

/** Returns "iv.authTag.ciphertext", all base64. Never log the input. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64"))
    .join(".")
}

/** Reverses encryptSecret(). Throws if the payload was altered or the key changed. */
export function decryptSecret(payload: string): string {
  const [iv, authTag, ciphertext] = payload.split(".")
  if (!iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted payload")
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(iv, "base64")
  )
  decipher.setAuthTag(Buffer.from(authTag, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

/** Last 4 characters of an access key id — the only part safe to store in the clear. */
export function last4(value: string): string {
  return value.slice(-4)
}

/** Display form of an access key id, built from the stored last 4. */
export function maskAccessKeyId(keyLast4: string | null): string | null {
  return keyLast4 ? `AKIA••••••••••••${keyLast4}` : null
}
