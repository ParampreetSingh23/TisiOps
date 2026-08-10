/**
 * Patterns for values that must never reach the log table.
 *
 * A log row is shown in the browser and kept forever, so this is the last
 * checkpoint before a token, key, or connection string becomes permanent. The
 * handlers already avoid logging secrets; this is the backstop for the message
 * that gets assembled from something upstream.
 */
const REDACTIONS: [RegExp, string][] = [
  // Connection strings carry the password in their userinfo.
  [/\b(rediss?|postgres(?:ql)?):\/\/[^\s]+/gi, "$1://«redacted»"],
  [/(AKIA|ASIA)[A-Z0-9]{16}/g, "«redacted»"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "«redacted»"],
  [/\bvcp?_[A-Za-z0-9]{20,}/g, "«redacted»"],
  [/\bsk-[A-Za-z0-9-]{20,}/g, "«redacted»"],
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    "«redacted»",
  ],
  // The key prefix is part of the match because `\b` does not fire inside a
  // name like DB_POSTGRESDB_PASSWORD — underscore is a word character, so
  // anchoring on the bare word missed every screaming-snake-case variable.
  [
    /([\w-]*(?:password|secret|token|api[_-]?key|encryption[_-]?key))\s*[=:]\s*\S+/gi,
    "$1=«redacted»",
  ],
]

/** Applied to every message before it is written. */
export function redact(message: string): string {
  return REDACTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    message
  )
}
