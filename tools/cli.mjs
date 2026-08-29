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
import { initializeProject, packProject, submitProject } from "./lib/project-tools.mjs";
import { generateSigningKey, signRegistry, verifyRegistrySignature } from "./lib/signature.mjs";

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
    await verifyRegistrySignature(rootDirectory);
    console.log("完整校验通过");
  } else if (command === "ppext") {
    await handlePpext(argumentsList);
  } else if (command === "submit") {
    const project = path.resolve(optionValue(argumentsList, "--project") ?? ".");
    const result = await submitProject(rootDirectory, project);
    console.log(`首次登记已生成：${result.extensionPath}`);
  } else if (command === "registry-sign") {
    const keyPath = optionValue(argumentsList, "--key") ?? process.env.PACKINGPROOF_MARKET_SIGNING_KEY;
    if (!keyPath) throw new Error("registry-sign 需要 --key 或 PACKINGPROOF_MARKET_SIGNING_KEY");
    const result = await signRegistry(rootDirectory, path.resolve(keyPath));
    console.log(`registry 已签名，keyId=${result.keyId}`);
  } else if (command === "registry-verify") {
    const result = await verifyRegistrySignature(rootDirectory);
    console.log(`registry 签名有效，keyId=${result.keyId}`);
  } else if (command === "keygen") {
    const privatePath = optionValue(argumentsList, "--private");
    if (!privatePath) throw new Error("keygen 需要 --private <path>");
    await generateSigningKey(path.resolve(privatePath), path.join(rootDirectory, "registry", "catalog-public-key.pem"));
    console.log("签名密钥已生成；私钥仅保存在指定的本机路径");
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

async function handlePpext(values) {
  const action = values[0];
  const directoryValue = values[1]?.startsWith("--") ? null : values[1];
  const projectDirectory = path.resolve(directoryValue ?? ".");
  if (action === "init") {
    await initializeProject(projectDirectory, await collectInitValues(values));
    console.log(`扩展项目已初始化：${projectDirectory}`);
    return;
  }
  if (action === "pack") {
    const manifest = JSON.parse(await import("node:fs/promises")
      .then(({ readFile }) => readFile(path.join(projectDirectory, "manifest.json"), "utf8")));
    const output = path.resolve(optionValue(values, "--out") ?? path.join(projectDirectory, `${manifest.id}-${manifest.version}.ppext`));
    await packProject(projectDirectory, output, rootDirectory);
    console.log(`PPEXT 已生成：${output}`);
    return;
  }
  throw new Error("ppext 仅支持 init 或 pack");
}

async function collectInitValues(values) {
  const { createInterface } = await import("node:readline/promises");
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  async function value(name, question, fallback = null) {
    const provided = optionValue(values, `--${name}`);
    if (provided) return provided;
    const answer = (await prompts.question(`${question}${fallback ? `（默认 ${fallback}）` : ""}: `)).trim();
    return answer || fallback;
  }
  try {
    const id = await value("id", "扩展 ID");
    const publisherId = await value("publisher", "Publisher ID", id?.split(".")[0]);
    const name = await value("name", "扩展名称");
    const type = await value("type", "类型 userscript/external-adapter", "external-adapter");
    const sourceAvailability = type === "userscript"
      ? "open-source"
      : await value("source", "源码状态 open-source/closed-source", "open-source");
    const provider = await value("provider", "发布平台 gitee/github", "gitee");
    const owner = await value("owner", "发布平台账号");
    const repositoryName = await value("repository", "发布仓库名");
    const repository = { provider, owner, name: repositoryName };
    const licenseName = await value("license", sourceAvailability === "open-source" ? "SPDX 许可证" : "使用许可名称", sourceAvailability === "open-source" ? "MIT" : "Proprietary");
    const licenseUrl = await value("license-url", "许可证或使用条款地址");
    return {
      id,
      publisherId,
      name,
      author: await value("author", "作者或组织名称"),
      authorUrl: await value("author-url", "作者或组织公开主页"),
      version: await value("version", "版本", type === "userscript" ? "1.0" : "1.0.0"),
      type,
      minPackingProofVersion: await value("min-version", "最低 PackingProof 版本", "0.0.63"),
      payload: await value("payload", "payload 文件", type === "userscript" ? "payload/main.user.js" : "payload/adapter.exe"),
      summary: await value("summary", "一句话简介"),
      description: await value("description", "详细说明"),
      homepage: await value("homepage", "项目主页"),
      sourceAvailability,
      accounts: { [provider]: owner },
      repository: sourceAvailability === "open-source" ? repository : null,
      license: sourceAvailability === "open-source"
        ? { spdx: licenseName, sourceUrl: licenseUrl }
        : { name: licenseName, termsUrl: licenseUrl },
      releaseSources: [repository],
    };
  } finally {
    prompts.close();
  }
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
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "packingproof-ppext-"));
  try {
    for (const [, relativePath] of versionChanges) {
      const version = JSON.parse(await import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, relativePath), "utf8")));
      const extension = market.extensions.get(version.extensionId);
      if (!extension) throw new Error(`${relativePath}: 扩展不存在`);
      if (extension.descriptor.type === "userscript" && !/^\d+\.\d+$/.test(version.version)) {
        throw new Error(`${relativePath}: 新 userscript 版本必须使用 X.Y`);
      }
      const downloads = version.downloads.primary
        ? [version.downloads.primary, version.downloads.mirror]
        : [version.downloads.gitee, version.downloads.github];
      const availableDownloads = downloads.filter(Boolean);
      const firstPath = path.join(temporaryDirectory, `${version.extensionId}-${version.version}-first.ppext`);
      await downloadPackage(availableDownloads[0].url, firstPath);
      const result = await validatePackage(firstPath, market.schema, {
        id: version.extensionId,
        version: version.version,
        type: extension.descriptor.type,
        compatibility: version.compatibility,
        access: version.access,
      });
      const digest = await sha256File(firstPath);
      if (digest !== version.sha256 || result.packageSize !== version.size) {
        throw new Error(`${relativePath}: 主制品大小或 SHA-256 不匹配`);
      }
      if (availableDownloads[1]) {
        const mirrorPath = path.join(temporaryDirectory, `${version.extensionId}-${version.version}-mirror.ppext`);
        await downloadPackage(availableDownloads[1].url, mirrorPath);
        if (await sha256File(mirrorPath) !== digest || (await import("node:fs/promises").then(({ stat }) => stat(mirrorPath))).size !== result.packageSize) {
          throw new Error(`${relativePath}: Gitee 与 GitHub 制品不一致`);
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
