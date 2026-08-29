import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMarket } from "../tools/lib/market-validator.mjs";
import { buildRegistry } from "../tools/lib/registry.mjs";
import { writeJson } from "./helpers.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("loads valid fixtures and generates a deterministic split registry", async () => {
  const root = await createFixtureRoot();
  try {
    const market = await loadMarket(root);
    const first = await buildRegistry(root, market);
    const firstBytes = await readFile(path.join(root, "registry", "catalog.v1.json"), "utf8");
    const second = await buildRegistry(root, await loadMarket(root));
    const secondBytes = await readFile(path.join(root, "registry", "catalog.v1.json"), "utf8");
    assert.deepEqual(first, second);
    assert.equal(firstBytes, secondBytes);
    assert.equal(first.extensions[0].id, "sample.demo");
    assert.equal(first.extensions[0].trust, "third-party");
    assert.equal(first.extensions[0].latestVersion, "1.0.0");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects userscript packages declared as an operating-system platform", async () => {
  const root = await createFixtureRoot();
  try {
    const versionPath = path.join(root, "extensions", "sample.demo", "versions", "1.0.0.json");
    const version = JSON.parse(await readFile(versionPath, "utf8"));
    version.compatibility.platforms = { windows: ["x64"] };
    await writeJson(versionPath, version);
    await assert.rejects(loadMarket(root), /userscript 平台必须是 userscript/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects capability declarations without enforced API permissions", async () => {
  const root = await createFixtureRoot();
  try {
    const versionPath = path.join(root, "extensions", "sample.demo", "versions", "1.0.0.json");
    const version = JSON.parse(await readFile(versionPath, "utf8"));
    version.access.packingProofCapabilities = ["order.lookup"];
    version.access.packingProofPermissions = [];
    await writeJson(versionPath, version);
    await assert.rejects(loadMarket(root), /扫码能力必须声明/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("allows a closed-source external adapter with public identity and terms", async () => {
  const root = await createFixtureRoot();
  try {
    const publisherPath = path.join(root, "publishers", "sample.json");
    const publisher = JSON.parse(await readFile(publisherPath, "utf8"));
    publisher.homepage = "https://gitee.com/SampleOrg";
    await writeJson(publisherPath, publisher);
    const extensionPath = path.join(root, "extensions", "sample.demo", "extension.json");
    const extension = JSON.parse(await readFile(extensionPath, "utf8"));
    extension.type = "external-adapter";
    extension.sourceAvailability = "closed-source";
    extension.homepage = "https://gitee.com/SampleOrg/Demo";
    delete extension.repository;
    extension.license = { name: "Proprietary", termsUrl: "https://gitee.com/SampleOrg/Demo/terms" };
    await writeJson(extensionPath, extension);
    const versionPath = path.join(root, "extensions", "sample.demo", "versions", "1.0.0.json");
    const version = JSON.parse(await readFile(versionPath, "utf8"));
    version.compatibility.platforms = { windows: ["any"] };
    await writeJson(versionPath, version);
    const market = await loadMarket(root);
    const catalog = await buildRegistry(root, market);
    assert.deepEqual(catalog.extensions[0].riskLabels, ["external-program", "closed-source-external"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a closed-source userscript", async () => {
  const root = await createFixtureRoot();
  try {
    const extensionPath = path.join(root, "extensions", "sample.demo", "extension.json");
    const extension = JSON.parse(await readFile(extensionPath, "utf8"));
    extension.sourceAvailability = "closed-source";
    await writeJson(extensionPath, extension);
    await assert.rejects(loadMarket(root), /userscript 必须公开源码/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "packingproof-market-"));
  await cp(path.join(repositoryRoot, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(repositoryRoot, "fixtures", "valid", "publishers"), path.join(root, "publishers"), { recursive: true });
  await cp(path.join(repositoryRoot, "fixtures", "valid", "extensions"), path.join(root, "extensions"), { recursive: true });
  return root;
}
