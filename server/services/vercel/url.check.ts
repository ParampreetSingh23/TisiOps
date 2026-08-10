import assert from "node:assert/strict"

import { projectName, publicProjectUrl } from "./client"

/**
 * Run with `npm run check:urls --workspace @tisiops/server`.
 *
 * Guards the one rule the whole preview-URL fix rests on: the user is shown
 * the project alias, never the per-build URL that Deployment Protection blocks.
 */

const BUILD_URL = "tisiops-alice-notesappjs-qi49925vt-tisi-ops.vercel.app"
const PROJECT_URL = "tisiops-alice-notesappjs.vercel.app"

// The project alias wins even when Vercel lists the build URL first.
assert.equal(
  publicProjectUrl(
    [BUILD_URL, PROJECT_URL],
    "tisiops-alice-notesappjs",
    `https://${BUILD_URL}`
  ),
  `https://${PROJECT_URL}`
)

// No aliases yet: fall back to the name the project was created with.
assert.equal(
  publicProjectUrl([], "tisiops-alice-notesappjs"),
  `https://${PROJECT_URL}`
)

// A build URL on its own must never become the URL shown to the user.
assert.equal(
  publicProjectUrl(
    [BUILD_URL],
    "tisiops-alice-notesappjs",
    `https://${BUILD_URL}`
  ),
  `https://${PROJECT_URL}`
)

// Name taken globally: Vercel's scoped alias is real, the constructed one is
// not, so the alias must win over the guess.
assert.equal(
  publicProjectUrl(
    [BUILD_URL, "tisiops-alice-notesappjs-tisi-ops.vercel.app"],
    "tisiops-alice-notesappjs",
    `https://${BUILD_URL}`
  ),
  "https://tisiops-alice-notesappjs-tisi-ops.vercel.app"
)

// Same repository name, different owners: separate projects, separate URLs.
assert.notEqual(
  projectName("alice", "notes-app"),
  projectName("bob", "notes-app")
)

// The name must survive as a hostname label.
assert.equal(
  projectName("Alice_Dev", "Notes.App", "apps/web"),
  "tisiops-alice-dev-notes-app-apps-web"
)

console.log("vercel url checks passed")
