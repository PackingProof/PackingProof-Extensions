import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMarket } from "../tools/lib/market-validator.mjs";
import { discoverWithFallback, updateExtension } from "../tools/lib/releases.mjs";
import { externalManifest, writeJson, writeZip } from "./helpers.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("falls back to the mirror release API when primary discovery fails", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url).includes("gitee.com")) throw new Error("primary unavailable");
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
      { provider: "gitee", owner: "SampleOrg", name: "Demo" },
      { provider: "github", owner: "SampleOrg", name: "Demo" },
    ]);
    assert.equal(result.source.provider, "github");
    assert.equal(result.releases[0].tag, "v1.2.0");
    assert.equal(requested.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("creates the versions directory for the first discovered release", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "packingproof-first-release-"));
  const originalFetch = globalThis.fetch;
  try {
    await cp(path.join(repositoryRoot, "schemas"), path.join(root, "schemas"), { recursive: true });
    await writeJson(path.join(root, "publishers", "packingproof.json"), {
      schemaVersion: 1,
      id: "packingproof",
      displayName: "PackingProof",
      accounts: { github: "PackingProof" },
    });
    await writeJson(path.join(root, "extensions", "packingproof.test", "extension.json"), {
      schemaVersion: 1,
      id: "packingproof.test",
      publisherId: "packingproof",
      name: "Test Adapter",
      summary: "Test adapter for release discovery",
      description: "Test adapter for release discovery and first-version directory creation",
      type: "external-adapter",
      repository: { provider: "github", owner: "PackingProof", name: "TestAdapter" },
      license: { spdx: "MIT", sourceUrl: "https://github.com/PackingProof/TestAdapter/blob/main/LICENSE" },
      releaseSources: [{ provider: "github", owner: "PackingProof", name: "TestAdapter" }],
    });
    const ppxPath = path.join(root, "test.ppx");
    const manifest = externalManifest({ id: "packingproof.test" });
    await writeZip(ppxPath, [
      ["manifest.json", JSON.stringify(manifest)],
      ["payload/adapter.exe", Buffer.from([1, 2, 3, 4])],
    ]);
    const ppxBytes = await readFile(ppxPath);
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.includes("/releases?")) {
        return jsonResponse([{
          tag_name: "v1.0.0",
          draft: false,
          prerelease: false,
          published_at: "2026-08-29T00:00:00Z",
          assets: [{ name: "packingproof.test-1.0.0.ppx" }],
        }], value);
      }
      if (value.includes("/commits/")) {
        return jsonResponse({ sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, value);
      }
      const response = new Response(ppxBytes, {
        status: 200,
        headers: { "content-length": String(ppxBytes.length) },
      });
      Object.defineProperty(response, "url", { value });
      return response;
    };

    const created = await updateExtension(root, await loadMarket(root), "packingproof.test");
    assert.equal(created.length, 1);
    const version = JSON.parse(await readFile(
      path.join(root, "extensions", "packingproof.test", "versions", "1.0.0.json"),
      "utf8",
    ));
    assert.equal(version.extensionId, "packingproof.test");
    assert.equal(version.version, "1.0.0");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

function jsonResponse(value, url) {
  const response = new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}
