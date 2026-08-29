import assert from "node:assert/strict";
import test from "node:test";
import { discoverWithFallback } from "../tools/lib/releases.mjs";

test("falls back to the mirror release API when primary discovery fails", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("api.github.com")) throw new Error("primary unavailable");
    return {
      ok: true,
      json: async () => [{
        tag_name: "v1.2.0",
        draft: false,
        prerelease: false,
        published_at: "2026-08-29T00:00:00Z",
        assets: [{ name: "sample.demo-1.2.0.ppx" }],
      }],
    };
  };
  try {
    const result = await discoverWithFallback([
      { provider: "github", owner: "SampleOrg", name: "Demo" },
      { provider: "gitee", owner: "SampleOrg", name: "Demo" },
    ]);
    assert.equal(result.source.provider, "gitee");
    assert.equal(result.releases[0].tag, "v1.2.0");
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
