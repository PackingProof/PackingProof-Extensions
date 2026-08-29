#!/usr/bin/env node
import "./lib/http.mjs";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadMarket } from "./lib/market-validator.mjs";
import { downloadPackage, sha256File, validatePackage } from "./lib/package-validator.mjs";
import { buildRegistry } from "./lib/registry.mjs";
import { updateExtension } from "./lib/releases.mjs";

const execFileAsync = promisify(execFile);
const rootDirectory = process.cwd();
const [command = "check", ...argumentsList] = process.argv.slice(2);

try {
  if (command === "validate") {
    await loadMarket(rootDirectory, { validateRegistry: true });
    console.log("市场源数据与 registry Schema 校验通过");
  } else if (command === "generate") {
    const market = await loadMarket(rootDirectory);
    await buildRegistry(rootDirectory, market);
    await loadMarket(rootDirectory, { validateRegistry: true });
    console.log("registry 已生成");
  } else if (command === "check") {
    const market = await loadMarket(rootDirectory);
    await buildRegistry(rootDirectory, market);
    await loadMarket(rootDirectory, { validateRegistry: true });
    console.log("完整校验通过");
  } else if (command === "verify-changed") {
    const base = optionValue(argumentsList, "--base") ?? "origin/main";
    await verifyChangedVersions(rootDirectory, base);
  } else if (command === "update") {
    const extensionId = optionValue(argumentsList, "--extension");
    if (!extensionId) throw new Error("update 需要 --extension <id>");
    const market = await loadMarket(rootDirectory);
    const created = await updateExtension(rootDirectory, market, extensionId);
    console.log(created.length ? `新增 ${created.length} 个版本` : "没有发现新稳定版本");
  } else if (command === "list-extensions") {
    const market = await loadMarket(rootDirectory);
    for (const extensionId of market.extensions.keys()) console.log(extensionId);
  } else {
    throw new Error(`未知命令：${command}`);
  }
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}

async function verifyChangedVersions(root, base) {
  const { stdout } = await execFileAsync("git", [
    "diff", "--name-status", `${base}...HEAD`, "--",
    "publishers/*.json",
    "extensions/*/extension.json",
    "extensions/*/versions/*.json",
    "advisories/*/*.json",
  ], { cwd: root });
  const changes = stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
  for (const change of changes) {
    const [status, relativePath] = change;
    if (status.startsWith("R") || status === "D") {
      throw new Error(`登记身份、历史版本和公告不可重命名或删除：${change.slice(1).join(" -> ")}`);
    }
    if (/^extensions\/[^/]+\/versions\/[^/]+\.json$/.test(relativePath)
        || /^advisories\/[^/]+\/[^/]+\.json$/.test(relativePath)) {
      if (status !== "A") throw new Error(`历史版本清单和公告不可修改：${relativePath}`);
    }
    if (status === "M" && /^publishers\/[^/]+\.json$/.test(relativePath)) {
      await assertStableFields(root, base, relativePath, ["id"]);
    }
    if (status === "M" && /^extensions\/[^/]+\/extension\.json$/.test(relativePath)) {
      await assertStableFields(root, base, relativePath, ["id", "publisherId", "type"]);
    }
  }
  const versionChanges = changes.filter(([, relativePath]) => /^extensions\/[^/]+\/versions\/[^/]+\.json$/.test(relativePath));
  if (!versionChanges.length) {
    console.log("没有新增版本需要验证");
    return;
  }
  const market = await loadMarket(root);
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "packingproof-ppx-"));
  try {
    for (const [, relativePath] of versionChanges) {
      const version = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, relativePath), "utf8")));
      const extension = market.extensions.get(version.extensionId);
      if (!extension) throw new Error(`${relativePath}: 扩展不存在`);
      const primaryPath = path.join(temporaryDirectory, `${version.extensionId}-${version.version}-primary.ppx`);
      await downloadPackage(version.downloads.primary.url, primaryPath);
      const result = await validatePackage(primaryPath, market.schema, {
        id: version.extensionId,
        version: version.version,
        type: extension.descriptor.type,
        compatibility: version.compatibility,
        access: version.access,
      });
      const digest = await sha256File(primaryPath);
      if (digest !== version.sha256 || result.packageSize !== version.size) {
        throw new Error(`${relativePath}: 主制品大小或 SHA-256 不匹配`);
      }
      if (version.downloads.mirror) {
        const mirrorPath = path.join(temporaryDirectory, `${version.extensionId}-${version.version}-mirror.ppx`);
        await downloadPackage(version.downloads.mirror.url, mirrorPath);
        if (await sha256File(mirrorPath) !== digest || (await import("node:fs/promises").then(({ stat }) => stat(mirrorPath))).size !== result.packageSize) {
          throw new Error(`${relativePath}: 主源与镜像制品不一致`);
        }
      }
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(`已验证 ${versionChanges.length} 个新增版本制品`);
}

async function assertStableFields(root, base, relativePath, fields) {
  const { stdout } = await execFileAsync("git", ["show", `${base}:${relativePath}`], { cwd: root });
  const previous = JSON.parse(stdout);
  const current = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, relativePath), "utf8")));
  for (const field of fields) {
    if (previous[field] !== current[field]) throw new Error(`${relativePath}: ${field} 合并后不可修改`);
  }
}

function optionValue(values, name) {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : null;
}
