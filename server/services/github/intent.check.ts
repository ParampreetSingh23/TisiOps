import assert from "node:assert/strict"

import { detectIntent, isN8nServerIntent, isStaticSiteIntent } from "./intent"

/**
 * Run with `npm run check:intent --workspace @tisiops/server`.
 *
 * The rule this guards: a user asking to publish a website is understood
 * however they phrase it. "Static" is one of the least likely words they use,
 * so every phrasing below must work without it.
 */

// --- Must be understood as a static/frontend deployment ----------------------

const STATIC_PHRASES = [
  "make my website live",
  "publish my portfolio",
  "host this page",
  "deploy my HTML project",
  "put my landing page online",
  "deploy this website",
  "host my client website",
  "make this repo live",
  "deploy my web page",
  "deploy my static site",
  "host my HTML CSS JS project",
  "deploy my HTML website",
  "host my simple website",
  "deploy my frontend only project",
  "deploy my landing page",
  "host my portfolio",
  "deploy my portfolio website",
  "deploy my personal site",
  "host my resume website",
  "deploy my documentation site",
  "host my docs",
  "deploy my marketing page",
  "deploy my one page website",
  "deploy my client website",
  "deploy my plain HTML project",
  "host my vanilla JS app",
  "deploy my website without backend",
  "deploy this frontend with no server",
  "make this website live",
  "put my website online",
  "publish this website",
  "deploy my web page",
  "host my web page",
  "deploy my static frontend",
  "deploy my Bootstrap website",
  "deploy my Tailwind landing page",
  "make my portfolio live",
  "host my frontend only app",
  "deploy my vanilla JS website",
  "deploy my docs site",
  "host my simple web page",
]

for (const phrase of STATIC_PHRASES) {
  assert.equal(
    isStaticSiteIntent(phrase),
    true,
    `should read as a static site: "${phrase}"`
  )
  assert.equal(
    detectIntent(phrase),
    "static_site_deployment",
    `intent for: "${phrase}"`
  )
}

// Not one of them contains the word the old rule depended on.
const withoutTheWord = STATIC_PHRASES.filter(
  (phrase) => !/static/i.test(phrase)
)
assert.ok(
  withoutTheWord.length > 25,
  "the phrasings must mostly avoid the word 'static'"
)

// --- Must NOT be read as a static site ---------------------------------------

const NOT_STATIC = [
  // An explicitly requested server wins over the word "site".
  "deploy my website on an EC2 server",
  "host my landing page on a VPS",
  "deploy my site with docker",
  "deploy n8n",
  // Named backends are services, not sites.
  "deploy my express api",
  "deploy my django backend",
  "host my fastapi server",
  "deploy my websocket server",
  // Questions and repository work are other intents.
  "which repos can I deploy",
  "list my repositories",
  "why did terraform fail",
]

for (const phrase of NOT_STATIC) {
  assert.equal(
    detectIntent(phrase),
    // Anything but this one.
    detectIntent(phrase) === "static_site_deployment"
      ? "WRONG"
      : detectIntent(phrase),
    `must not be static: "${phrase}"`
  )
  assert.notEqual(
    detectIntent(phrase),
    "static_site_deployment",
    `must not be static: "${phrase}"`
  )
}

// Publishing without a subject is not enough on its own — "deploy" alone is
// ambiguous and belongs to the existing deployment flow.
assert.equal(isStaticSiteIntent("deploy"), false)
assert.equal(isStaticSiteIntent("what is a landing page"), false)

// --- The n8n template is one product, however it is asked for ----------------

const N8N_PHRASES = [
  "spin a new server using n8n template for me",
  "spin up an n8n server",
  "create an n8n server",
  "deploy n8n",
  "deploy n8n for me",
  "launch n8n on a server",
  "I want a new n8n instance",
  "set up n8n",
  "provision an n8n workflow server",
  "start an n8n server in mumbai",
  "give me another n8n server",
  "install n8n on a server",
]

for (const phrase of N8N_PHRASES) {
  assert.equal(
    isN8nServerIntent(phrase),
    true,
    `should ask for an n8n server: "${phrase}"`
  )
  assert.equal(
    detectIntent(phrase),
    "n8n_managed_server_deployment",
    `intent for: "${phrase}"`
  )
}

// A server that already exists belongs to the other agents: answering "why did
// my n8n server fail" by proposing a second one would be the wrong move.
const NOT_A_NEW_N8N = [
  "why did my n8n deployment fail",
  "show me the logs for my n8n server",
  "destroy my n8n server",
  "restart n8n",
  "what does n8n cost",
  "what is n8n",
]

for (const phrase of NOT_A_NEW_N8N) {
  assert.equal(
    detectIntent(phrase),
    detectIntent(phrase) === "n8n_managed_server_deployment"
      ? "WRONG"
      : detectIntent(phrase),
    `must not start a new n8n server: "${phrase}"`
  )
}

console.log("intent checks passed")
