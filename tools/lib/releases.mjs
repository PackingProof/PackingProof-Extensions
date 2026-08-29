import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stableJson } from "./files.mjs";
import { buildRegistry } from "./registry.mjs";
import { downloadPackage, sha256File, validatePackage } from "./package-validator.mjs";
import { compareExtensionVersions, normalizedExtensionVersion, releaseAssetUrl } from "./policy.mjs";

export async function updateExtension(rootDirectory, market, extensionId, options = {}) {
  const item = market.extensions.get(extensionId);
  if (!item) throw new Error(`扩展不存在：${extensionId}`);
  const known = new Set(item.versions.map((version) => version.version));
  const discoveries = await discoverAll(item.descriptor.releaseSources);
  const releasesByVersion = new Map();
  for (const discovery of discoveries.filter((value) => value.releases)) {
    for (const release of discovery.releases) {
      for (const assetName of release.assets) {
        const version = extensionAssetVersion(extensionId, assetName, item.descriptor.type);
        if (!version) continue;
        const current = releasesByVersion.get(version);
        const assets = [...new Set([...(current?.assets ?? []), ...release.assets])];
        if (!current || discovery.source.provider === "gitee") {
          releasesByVersion.set(version, { ...release, assets, version, source: discovery.source });
        } else {
          current.assets = assets;
        }
      }
    }
  }
  const candidates = [...releasesByVersion.values()]
    .filter((release) => !known.has(release.version)
      && (!options.onlyVersion || release.version === options.onlyVersion))
    .sort((left, right) => compareExtensionVersions(left.version, right.version, item.descriptor.type));
  const created = [];
  const pendingDocuments = [];

  for (const release of candidates) {
    const assetName = `${extensionId}-${release.version}.ppext`;
    if (!release.assets.includes(assetName)) continue;
    const cacheDirectory = path.join(rootDirectory, ".cache", "updates", extensionId, release.version);
    await mkdir(cacheDirectory, { recursive: true });
    const downloads = await resolveDownloads(item.descriptor.releaseSources, release.tag, assetName, cacheDirectory);
    const available = [downloads.gitee, downloads.github].find((value) => value?.filePath);
    if (!available?.filePath) {
      const reasons = [downloads.gitee, downloads.github]
        .filter(Boolean)
        .map((value) => `${value.provider}: ${value.error}`)
        .join("；");
      throw new Error(`${extensionId} ${release.version}: 所有发布源均无法下载扩展包：${reasons}`);
    }
    const packageResult = await validatePackage(available.filePath, market.schema);
    if (packageResult.manifest.id !== extensionId
        || packageResult.manifest.version !== release.version
        || packageResult.manifest.type !== item.descriptor.type) {
      throw new Error(`${extensionId} ${release.version}: manifest 身份与扩展登记不一致`);
    }
    const digest = await sha256File(available.filePath);
    for (const candidate of [downloads.gitee, downloads.github].filter(Boolean)) {
      if (!candidate.filePath) continue;
      const candidateDigest = await sha256File(candidate.filePath);
      if (candidateDigest !== digest || candidate.size !== available.size) {
        throw new Error(`${extensionId} ${release.version}: Gitee 与 GitHub 制品不一致`);
      }
    }
    const commit = await resolveCommit(release.source, release.tag);
    const availableDownloads = Object.fromEntries(
      [downloads.gitee, downloads.github]
        .filter((value) => value?.filePath)
        .map((value) => [value.provider, { provider: value.provider, url: value.url }]),
    );
    const document = {
      $schema: "../../../schemas/version.v1.schema.json",
      schemaVersion: 1,
      extensionId,
      version: release.version,
      publishedAt: release.publishedAt,
      source: { tag: release.tag, commit },
      downloads: availableDownloads,
      sha256: digest,
      size: available.size,
      compatibility: packageResult.manifest.compatibility,
      access: packageResult.manifest.access,
    };
    const targetPath = path.join(rootDirectory, "extensions", extensionId, "versions", `${release.version}.json`);
    pendingDocuments.push({ targetPath, document });
    created.push(targetPath);
  }

  if (pendingDocuments.length) {
    for (const pending of pendingDocuments) {
      await mkdir(path.dirname(pending.targetPath), { recursive: true });
      await writeFile(pending.targetPath, stableJson(pending.document), { encoding: "utf8", flag: "wx" });
    }
    const refreshed = await import("./market-validator.mjs").then(({ loadMarket }) => loadMarket(rootDirectory));
    await buildRegistry(rootDirectory, refreshed);
  }
  return created;
}

function extensionAssetVersion(extensionId, assetName, type) {
  const prefix = `${extensionId}-`;
  const suffix = ".ppext";
  if (!assetName.startsWith(prefix) || !assetName.endsWith(suffix)) return null;
  const value = assetName.slice(prefix.length, -suffix.length);
  return normalizedExtensionVersion(value, type) ? value : null;
}

export async function discoverWithFallback(sources) {
  const errors = [];
  for (const source of sources) {
    try {
      return { source, releases: await listReleases(source) };
    } catch (error) {
      errors.push(`${source.provider}: ${error.message}`);
    }
  }
  throw new Error(`所有发布源均无法发现版本：${errors.join("；")}`);
}

export async function discoverAll(sources) {
  const results = await Promise.all(sources.map(async (source) => {
    try {
      return { source, releases: await listReleases(source), error: null };
    } catch (error) {
      return { source, releases: null, error: error.message };
    }
  }));
  if (!results.some((value) => value.releases)) {
    throw new Error(`所有发布源均无法发现版本：${results.map((value) => `${value.source.provider}: ${value.error}`).join("；")}`);
  }
  return results;
}

async function resolveDownloads(sources, tag, assetName, cacheDirectory) {
  const values = [];
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const url = releaseAssetUrl(source, tag, assetName);
    const filePath = path.join(cacheDirectory, `${index}-${assetName}`);
    try {
      const existing = await stat(filePath).catch(() => null);
      if (existing?.size > 0) {
        values.push({ provider: source.provider, url, filePath, size: existing.size });
        continue;
      }
      const size = await downloadPackage(url, filePath);
      values.push({ provider: source.provider, url, filePath, size });
    } catch (error) {
      const reason = error.cause?.message ? `${error.message}: ${error.cause.message}` : error.message;
      values.push({ provider: source.provider, url, filePath: null, size: null, error: reason });
    }
  }
  return Object.fromEntries(values.map((value) => [value.provider, value]));
}

async function listReleases(source) {
  const endpoint = source.provider === "github"
    ? `https://api.github.com/repos/${source.owner}/${source.name}/releases?per_page=100`
    : `https://gitee.com/api/v5/repos/${source.owner}/${source.name}/releases?per_page=100`;
  const response = await fetchJson(endpoint, source.provider);
  if (!Array.isArray(response)) throw new Error("Release API 返回格式无效");
  return response
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => ({
      tag: release.tag_name,
      publishedAt: release.published_at ?? release.created_at,
      assets: (release.assets ?? []).map((asset) => asset.name),
    }));
}

async function resolveCommit(source, tag) {
  const endpoint = source.provider === "github"
    ? `https://api.github.com/repos/${source.owner}/${source.name}/commits/${encodeURIComponent(tag)}`
    : `https://gitee.com/api/v5/repos/${source.owner}/${source.name}/commits/${encodeURIComponent(tag)}`;
  const response = await fetchJson(endpoint, source.provider);
  if (!/^[0-9a-f]{40}$/.test(response.sha ?? "")) throw new Error(`无法解析源码提交：${tag}`);
  return response.sha;
}

async function fetchJson(url, provider) {
  const token = provider === "github" ? process.env.GITHUB_TOKEN : process.env.GITEE_TOKEN;
  const headers = {
    accept: "application/json",
    "user-agent": "PackingProof-Extensions-Updater/1",
  };
  if (token) headers.authorization = provider === "github" ? `Bearer ${token}` : `token ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
