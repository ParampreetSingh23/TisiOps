import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"

import { decryptSecret, encryptSecret, last4, maskAccessKeyId } from "./crypto"

/** Run with: npm run check:crypto --workspace @tisiops/server */

process.env.AWS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64")

const secret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
const encrypted = encryptSecret(secret)

assert.notEqual(encrypted, secret, "ciphertext must not equal plaintext")
assert.ok(!encrypted.includes(secret), "ciphertext must not contain plaintext")
assert.equal(decryptSecret(encrypted), secret, "round trip must return the secret")
assert.notEqual(
  encryptSecret(secret),
  encrypted,
  "a fresh IV must produce different ciphertext each time"
)

// Tampering must fail loudly rather than decrypt to something else.
const [iv, authTag, ciphertext] = encrypted.split(".")
const flipped = Buffer.from(ciphertext!, "base64")
flipped[0] ^= 0xff
assert.throws(
  () => decryptSecret(`${iv}.${authTag}.${flipped.toString("base64")}`),
  "tampered ciphertext must throw"
)

// A different key must not open the payload.
process.env.AWS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64")
assert.throws(() => decryptSecret(encrypted), "wrong key must throw")

assert.equal(last4("AKIAIOSFODNN7EXAMPLE"), "MPLE")
assert.equal(maskAccessKeyId("MPLE"), "AKIA••••••••••••MPLE")
assert.equal(maskAccessKeyId(null), null)

console.log("crypto.check: ok")
