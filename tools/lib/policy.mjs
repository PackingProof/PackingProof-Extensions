import path from "node:path";
import semver from "semver";
import parseSpdx from "spdx-expression-parse";
import licenseList from "spdx-license-list";

export const OFFICIAL_PUBLISHERS = new Set(["packingproof"]);
export const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 500 * 1024 * 1024;
export const MAX_ENTRY_COUNT = 2000;
export const MAX_COMPRESSION_RATIO = 200;
export const MAX_USERSCRIPT_BYTES = 1024 * 1024;

export function assertStableSemver(value, label) {
  if (!semver.valid(value) || semver.prerelease(value)) {
    throw new Error(`${label}: 版本必须是稳定 SemVer 2.0：${value}`);
  }
}

export function assertExtensionVersion(value, type, label) {
  if (type === "userscript") {
    if (!/^\d+\.\d+$/.test(value)) throw new Error(`${label}: userscript 版本必须是 X.Y：${value}`);
    return;
  }
  assertStableSemver(value, label);
}

export function assertStoredExtensionVersion(value, type, label) {
  if (type === "userscript" && /^\d+\.\d+(?:\.\d+)?$/.test(value)) return;
  assertExtensionVersion(value, type, label);
}

export function normalizedExtensionVersion(value, type, allowLegacyUserscript = false) {
  if (type === "userscript" && /^\d+\.\d+$/.test(value)) return `${value}.0`;
  if (type === "userscript" && !allowLegacyUserscript) return null;
  return semver.valid(value) && !semver.prerelease(value) ? value : null;
}

export function compareExtensionVersions(left, right, type) {
  return semver.compare(
    normalizedExtensionVersion(left, type, true),
    normalizedExtensionVersion(right, type, true),
  );
}

export function normalizedReleaseVersion(tag, type = "external-adapter") {
  const value = tag.startsWith("v") ? tag.slice(1) : tag;
  return normalizedExtensionVersion(value, type, true) ? value : null;
}

export function assertOsiLicense(expression, label) {
  let parsed;
  try {
    parsed = parseSpdx(expression);
  } catch (error) {
    throw new Error(`${label}: SPDX 表达式无效：${error.message}`);
  }
  const visit = (node) => {
    if (node.license) {
      const license = licenseList[node.license];
      if (!license?.osiApproved) {
        throw new Error(`${label}: 仅接受 OSI 认可的许可证：${node.license}`);
      }
      return;
    }
    visit(node.left);
    visit(node.right);
  };
  visit(parsed);
}

export function repositoryUrl(repository) {
  const host = repository.provider === "github" ? "github.com" : "gitee.com";
  return `https://${host}/${repository.owner}/${repository.name}`;
}

export function releaseAssetUrl(repository, tag, assetName) {
  return `${repositoryUrl(repository)}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

export function assertSafeRelativePath(value, label) {
  const normalized = value.replaceAll("\\", "/");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.split("/").some((part) => part === ".." || part === "")
    || normalized.includes(":")
    || path.posix.normalize(normalized) !== normalized
  ) {
    throw new Error(`${label}: 不安全的相对路径：${value}`);
  }
  return normalized;
}
