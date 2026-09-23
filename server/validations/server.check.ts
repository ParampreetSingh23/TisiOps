import assert from "node:assert/strict";

import { createBYOSServerSchema } from "./server";

const base = {
  host: "server.example.com",
  sshUsername: "ubuntu",
  authType: "key" as const,
  privateKey: "test-key",
};

assert.equal(
  createBYOSServerSchema.safeParse({ ...base, provider: "EXCLOUD" }).success,
  true,
);
assert.equal(
  createBYOSServerSchema.safeParse({ ...base, provider: "OTHER_VPS" }).success,
  false,
);
assert.equal(
  createBYOSServerSchema.safeParse({
    ...base,
    provider: "AWS",
    sshUsername: "",
  }).success,
  false,
);
