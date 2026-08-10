/**
 * What the model is allowed to hand back.
 *
 * The system prompt asks for these rules; this enforces them. A prompt is a
 * request, and a model that ignores it once puts provider pricing or a pile of
 * emoji in front of a user — so the two rules that matter commercially are
 * applied to the text itself.
 *
 * Pure: no model, no database, no environment.
 */

/**
 * Emoji, including the joined sequences.
 *
 * Kept to the pictographic ranges. Punctuation-like symbols (™, →, ×) are
 * deliberately untouched: they are typography, and stripping them would
 * mangle ordinary sentences.
 */
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{20E3}\u{2B00}-\u{2BFF}]/gu

export function stripEmoji(text: string): string {
  return (
    text
      .replace(EMOJI, "")
      // Zero-width joiners hold emoji sequences together and are invisible once
      // the pictographs are gone.
      .replace(/‍/g, "")
      // A stripped emoji leaves the space it was padded with.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+$/gm, "")
  )
}

/**
 * Provider pricing.
 *
 * TisiOps sells the deployment, not the server. An answer quoting AWS hourly
 * rates is a guide to skipping TisiOps and going to AWS directly, so prices
 * are removed rather than trusted to the prompt.
 *
 * Only currency amounts tied to a rate or a cost word are matched — a version
 * number or a port is never a price.
 */
const PRICE_PATTERNS: RegExp[] = [
  // $0.0204/hour, ~$0.04 per hr, USD 12/month
  /(?:~|about|approx\.?|around)?\s*(?:\$|USD|usd|₹|INR|€|£)\s?\d[\d,.]*\s*(?:\/|per\s+)\s*(?:hour|hr|month|mo|day|year|yr)\b/gi,
  // "costs $12", "priced at $0.02"
  /\b(?:cost[s]?|price[d]?|charge[sd]?|billed)\b[^.\n]{0,20}(?:\$|USD|usd|₹|INR|€|£)\s?\d[\d,.]*/gi,
  // A bare amount followed by a cost word: "$12 a month"
  /(?:\$|USD|usd|₹|INR|€|£)\s?\d[\d,.]*\s*(?:a|an|each)\s+(?:hour|month|day|year)\b/gi,
]

export const PRICE_REPLACEMENT =
  "(see the TisiOps plan you pick for what is included)"

export function stripPricing(text: string): string {
  return PRICE_PATTERNS.reduce(
    (result, pattern) => result.replace(pattern, PRICE_REPLACEMENT),
    text
  )
}

/** Everything a reply passes through before it reaches a user. */
export function sanitizeReply(text: string): string {
  return stripPricing(stripEmoji(text)).trim()
}
