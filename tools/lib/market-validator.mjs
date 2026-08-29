import path from "node:path";
import semver from "semver";
import { access } from "node:fs/promises";
import { fileSize, listDirectories, listJsonFiles, readJson } from "./files.mjs";
import {
  OFFICIAL_PUBLISHERS,
  assertOsiLicense,
  assertStableSemver,
  normalizedReleaseVersion,
  releaseAssetUrl,
  repositoryUrl,
} from "./policy.mjs";
import { createSchemaValidator } from "./schemas.mjs";

export async function loadMarket(rootDirectory, options = {}) {
  const schema = await createSchemaValidator(rootDirectory);
  const publishers = new Map();
  const extensions = new Map();
  const advisories = [];

  for (const filePath of await listJsonFiles(path.join(rootDirectory, "publishers"))) {
    const publisher = await readJson(filePath);
    schema.validate("publisher.v1.schema.json", publisher, filePath);
    const fileId = path.basename(filePath, ".json");
    if (fileId !== publisher.id) throw new Error(`${filePath}: 文件名必须与 Publisher ID 一致`);
    if (publishers.has(publisher.id)) throw new Error(`${filePath}: Publisher ID 重复`);
    publishers.set(publisher.id, publisher);
  }

  const claimedAccounts = new Map();
  for (const publisher of publishers.values()) {
    for (const [provider, account] of Object.entries(publisher.accounts)) {
      const key = `${provider}:${account.toLowerCase()}`;
      if (claimedAccounts.has(key)) {
        throw new Error(`发布平台账号被多个 Publisher 使用：${key}`);
      }
      claimedAccounts.set(key, publisher.id);
    }
  }

  for (const extensionDirectory of await listDirectories(path.join(rootDirectory, "extensions"))) {
    const descriptorPath = path.join(extensionDirectory, "extension.json");
    const extension = await readJson(descriptorPath);
    schema.validate("extension.v1.schema.json", extension, descriptorPath);
    const directoryId = path.basename(extensionDirectory);
    if (directoryId !== extension.id) throw new Error(`${descriptorPath}: 目录名必须与扩展 ID 一致`);
    if (!extension.id.startsWith(`${extension.publisherId}.`)) {
      throw new Error(`${descriptorPath}: 新扩展 ID 必须使用 Publisher ID 前缀`);
    }
    const publisher = publishers.get(extension.publisherId);
    if (!publisher) throw new Error(`${descriptorPath}: Publisher 不存在：${extension.publisherId}`);
    if (extensions.has(extension.id)) throw new Error(`${descriptorPath}: 扩展 ID 重复`);
    validateSourcePolicy(extension, publisher, descriptorPath);
    validateReleaseSources(extension, publisher, descriptorPath);
    await validateIcon(extension, extensionDirectory, descriptorPath);

    const versions = [];
    const versionDirectory = path.join(extensionDirectory, "versions");
    for (const versionPath of await listJsonFiles(versionDirectory)) {
      const version = await readJson(versionPath);
      schema.validate("version.v1.schema.json", version, versionPath);
      validateVersion(extension, version, versionPath);
      if (path.basename(versionPath, ".json") !== version.version) {
        throw new Error(`${versionPath}: 文件名必须与版本号一致`);
      }
      if (versions.some((item) => item.version === version.version)) {
        throw new Error(`${versionPath}: 版本号重复`);
      }
      versions.push(version);
    }
    versions.sort((left, right) => semver.rcompare(left.version, right.version));
    extensions.set(extension.id, { descriptor: extension, publisher, versions });
  }

  for (const advisoryDirectory of await listDirectories(path.join(rootDirectory, "advisories"))) {
    for (const advisoryPath of await listJsonFiles(advisoryDirectory)) {
      const advisory = await readJson(advisoryPath);
      schema.validate("advisory.v1.schema.json", advisory, advisoryPath);
      validateAdvisory(advisory, advisoryPath, extensions);
      advisories.push(advisory);
    }
  }
  const withdrawn = new Set(advisories.map((item) => `${item.extensionId}@${item.version}`));
  for (const advisory of advisories) {
    if (advisory.replacedBy && withdrawn.has(`${advisory.extensionId}@${advisory.replacedBy}`)) {
      throw new Error(`${advisory.extensionId} ${advisory.version}: replacedBy 不能指向已撤回版本`);
    }
  }

  if (options.validateRegistry) {
    const catalogPath = path.join(rootDirectory, "registry", "catalog.v1.json");
    schema.validate("registry-catalog.v1.schema.json", await readJson(catalogPath), catalogPath);
    for (const filePath of await listJsonFiles(path.join(rootDirectory, "registry", "extensions"))) {
      schema.validate("registry-extension.v1.schema.json", await readJson(filePath), filePath);
    }
  }

  return { publishers, extensions, advisories, schema };
}

function validateReleaseSources(extension, publisher, label) {
  const providers = new Set();
  for (const source of extension.releaseSources) {
    if (providers.has(source.provider)) throw new Error(`${label}: 每个平台只能登记一个发布源`);
    providers.add(source.provider);
  }
  if (extension.repository) {
    if (!extension.releaseSources.some((source) => repositoriesEqual(source, extension.repository))) {
      throw new Error(`${label}: 源码仓库必须同时是已登记发布源`);
    }
    const owner = publisher.accounts[extension.repository.provider];
    if (!owner || owner.toLowerCase() !== extension.repository.owner.toLowerCase()) {
      throw new Error(`${label}: 源码仓库所有者必须匹配 Publisher 平台账号`);
    }
  }
  for (const source of extension.releaseSources) {
    const mappedOwner = publisher.accounts[source.provider];
    if (!mappedOwner || mappedOwner.toLowerCase() !== source.owner.toLowerCase()) {
      throw new Error(`${label}: 发布源所有者必须匹配 Publisher 的 ${source.provider} 账号`);
    }
  }
}

function validateSourcePolicy(extension, publisher, label) {
  const availability = extension.sourceAvailability ?? "open-source";
  if (extension.type === "userscript" && availability !== "open-source") {
    throw new Error(`${label}: userscript 必须公开源码`);
  }
  if (availability === "open-source") {
    if (!extension.repository) throw new Error(`${label}: 开源扩展必须登记源码仓库`);
    if (!extension.license.spdx) throw new Error(`${label}: 开源扩展必须使用 SPDX 许可证`);
    assertOsiLicense(extension.license.spdx, label);
    return;
  }
  if (extension.type !== "external-adapter") throw new Error(`${label}: 只有 external-adapter 可以闭源`);
  if (!publisher.homepage || !extension.homepage) {
    throw new Error(`${label}: 闭源外部程序必须提供作者主页和项目主页`);
  }
  if (!extension.license.name || !extension.license.termsUrl) {
    throw new Error(`${label}: 闭源外部程序必须提供使用许可名称和条款地址`);
  }
}

async function validateIcon(extension, extensionDirectory, label) {
  if (!extension.icon) return;
  const iconPath = path.join(extensionDirectory, extension.icon);
  try {
    await access(iconPath);
  } catch {
    throw new Error(`${label}: 图标文件不存在：${extension.icon}`);
  }
  if (await fileSize(iconPath) > 512 * 1024) throw new Error(`${label}: 图标不能超过 512 KB`);
}

function validateVersion(extension, version, label) {
  assertStableSemver(version.version, label);
  if (version.extensionId !== extension.id) throw new Error(`${label}: extensionId 与扩展不一致`);
  if (!normalizedReleaseVersion(version.source.tag)) {
    throw new Error(`${label}: 源码标签必须是稳定 SemVer，可选 v 前缀`);
  }
  if (version.compatibility.maxPackingProofVersion
      && semver.lt(version.compatibility.maxPackingProofVersion, version.compatibility.minPackingProofVersion)) {
    throw new Error(`${label}: 最大 PackingProof 版本不能低于最低版本`);
  }
  validatePlatforms(extension.type, version.compatibility.platforms, label);
  validateAccess(version.access, label);

  const expectedAssets = [
    `${extension.id}-${version.version}.ppext`,
    `${extension.id}-${version.version}.ppx`,
  ];
  for (const download of normalizedDownloads(version.downloads)) {
    const releaseSource = extension.releaseSources.find((source) => source.provider === download.provider);
    if (!releaseSource) throw new Error(`${label}: 下载地址必须来自已登记发布源`);
    const expectedUrls = expectedAssets.map((asset) => releaseAssetUrl(releaseSource, version.source.tag, asset));
    if (!expectedUrls.includes(download.url)) {
      throw new Error(`${label}: 下载地址必须是登记发布源的 Release Asset：${expectedUrls[0]}`);
    }
  }
}

function normalizedDownloads(downloads) {
  if (downloads.primary) return [downloads.primary, downloads.mirror].filter(Boolean);
  return [downloads.gitee, downloads.github].filter(Boolean);
}

function validatePlatforms(type, platforms, label) {
  const keys = Object.keys(platforms);
  if (type === "userscript") {
    if (keys.length !== 1 || keys[0] !== "userscript" || platforms.userscript[0] !== "any") {
      throw new Error(`${label}: userscript 平台必须是 userscript: [\"any\"]`);
    }
    return;
  }
  if (keys.length !== 1 || keys[0] !== "windows") {
    throw new Error(`${label}: v1 external-adapter 只允许 Windows 平台`);
  }
}

function validateAccess(accessDeclaration, label) {
  const permissions = new Set(accessDeclaration.packingProofPermissions);
  const capabilities = new Set(accessDeclaration.packingProofCapabilities);
  if (capabilities.size && (!permissions.has("scan-tasks.read") || !permissions.has("scan-results.write"))) {
    throw new Error(`${label}: 扫码能力必须声明 scan-tasks.read 和 scan-results.write`);
  }
  if (capabilities.has("measurement.capture") && !permissions.has("recording-fields.write")) {
    throw new Error(`${label}: measurement.capture 必须声明 recording-fields.write`);
  }
  if (permissions.has("recordings.download") && !permissions.has("recordings.search")) {
    throw new Error(`${label}: recordings.download 必须同时声明 recordings.search`);
  }
  if (permissions.has("recordings.delivery")
      && (!permissions.has("recordings.search") || !permissions.has("recordings.download"))) {
    throw new Error(`${label}: recordings.delivery 必须同时声明查询和下载权限`);
  }
  const systemAccess = new Set();
  for (const item of accessDeclaration.systemAccess) {
    if (systemAccess.has(item.id)) throw new Error(`${label}: 系统访问声明重复：${item.id}`);
    systemAccess.add(item.id);
  }
}

function validateAdvisory(advisory, label, extensions) {
  const extension = extensions.get(advisory.extensionId);
  if (!extension) throw new Error(`${label}: 撤回公告对应的扩展不存在`);
  const version = extension.versions.find((item) => item.version === advisory.version);
  if (!version) throw new Error(`${label}: 撤回公告对应的版本不存在`);
  if (path.basename(label, ".json") !== advisory.version
      || path.basename(path.dirname(label)) !== advisory.extensionId) {
    throw new Error(`${label}: 公告路径必须与扩展 ID 和版本一致`);
  }
  if (advisory.replacedBy) {
    const replacement = extension.versions.find((item) => item.version === advisory.replacedBy);
    if (!replacement) throw new Error(`${label}: replacedBy 对应版本不存在`);
  }
}

function repositoriesEqual(left, right) {
  return left.provider === right.provider
    && left.owner.toLowerCase() === right.owner.toLowerCase()
    && left.name.toLowerCase() === right.name.toLowerCase();
}

export function trustForPublisher(publisherId) {
  return OFFICIAL_PUBLISHERS.has(publisherId) ? "official" : "third-party";
}

export function extensionRepositoryUrl(extension) {
  return extension.repository ? repositoryUrl(extension.repository) : extension.homepage;
}
