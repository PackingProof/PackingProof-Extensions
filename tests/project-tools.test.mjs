import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeProject, packProject } from "../tools/lib/project-tools.mjs";
import { validatePackage } from "../tools/lib/package-validator.mjs";
import { createSchemaValidator } from "../tools/lib/schemas.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("initializes and packs a userscript from the small author manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppext-project-"));
  try {
    await initializeProject(root, projectValues());
    await writeFile(path.join(root, "payload", "main.user.js"), [
      "// ==UserScript==",
      "// @name Demo",
      "// @version 1.0",
      "// ==/UserScript==",
      "",
    ].join("\n"), "utf8");
    const output = path.join(root, "sample.demo-1.0.0.ppext");
    const packed = await packProject(root, output, repositoryRoot);
    assert.equal(packed.manifest.format, "packingproof-extension");
    assert.equal(packed.manifest.installation.mode, "userscript-import");
    assert.deepEqual(packed.manifest.compatibility.platforms, { userscript: ["any"] });
    const result = await validatePackage(output, await createSchemaValidator(repositoryRoot));
    assert.equal(result.manifest.id, "sample.demo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("packs an external adapter without asking for architecture or access declarations", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ppext-adapter-project-"));
  try {
    const values = projectValues({
      id: "sample.adapter",
      name: "Sample Adapter",
      type: "external-adapter",
      payload: "payload/adapter.exe",
    });
    await initializeProject(root, values);
    await writeFile(path.join(root, "payload", "adapter.exe"), Buffer.from([1, 2, 3, 4]));
    const output = path.join(root, "sample.adapter-1.0.0.ppext");
    const packed = await packProject(root, output, repositoryRoot);
    assert.deepEqual(packed.manifest.compatibility.platforms, { windows: ["any"] });
    assert.deepEqual(packed.manifest.access.systemAccess, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function projectValues(overrides = {}) {
  return {
    id: "sample.demo",
    publisherId: "sample",
    name: "Sample Demo",
    author: "Sample Publisher",
    authorUrl: "https://gitee.com/SampleOrg",
    version: "1.0.0",
    type: "userscript",
    minPackingProofVersion: "0.0.62",
    payload: "payload/main.user.js",
    summary: "Sample PackingProof extension",
    description: "Sample PackingProof extension used by the project tool tests",
    homepage: "https://gitee.com/SampleOrg/Demo",
    sourceAvailability: "open-source",
    accounts: { gitee: "SampleOrg" },
    repository: { provider: "gitee", owner: "SampleOrg", name: "Demo" },
    license: { spdx: "MIT", sourceUrl: "https://gitee.com/SampleOrg/Demo/blob/main/LICENSE" },
    releaseSources: [{ provider: "gitee", owner: "SampleOrg", name: "Demo" }],
    ...overrides,
  };
}
