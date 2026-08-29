import { createHash } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { stableJson, stableObject } from "./files.mjs";
import { trustForPublisher } from "./market-validator.mjs";

export async function buildRegistry(rootDirectory, market) {
  const registryDirectory = path.join(rootDirectory, "registry");
  const detailsDirectory = path.join(registryDirectory, "extensions");
  await mkdir(detailsDirectory, { recursive: true });

  const sourceDocument = {
    publishers: [...market.publishers.values()],
    extensions: [...market.extensions.values()].map((item) => ({
      descriptor: item.descriptor,
      versions: item.versions,
    })),
    advisories: market.advisories,
  };
  const sourceDigest = createHash("sha256")
    .update(JSON.stringify(stableObject(sourceDocument)))
    .digest("hex");

  const advisoryMap = new Map(
    market.advisories.map((advisory) => [`${advisory.extensionId}@${advisory.version}`, advisory]),
  );
  const catalogExtensions = [];
  const expectedDetailFiles = new Set();
  let updatedAt = null;

  for (const [id, item] of [...market.extensions.entries()].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const trust = trustForPublisher(item.publisher.id);
    const sourceAvailability = item.descriptor.sourceAvailability ?? "open-source";
    const riskLabels = [
      ...(item.descriptor.type === "external-adapter" ? ["external-program"] : []),
      ...(sourceAvailability === "closed-source" ? ["closed-source-external"] : []),
    ];
    const versions = item.versions.map((version) => {
      const advisory = advisoryMap.get(`${id}@${version.version}`);
      updatedAt = laterTimestamp(updatedAt, version.publishedAt);
      if (advisory) updatedAt = laterTimestamp(updatedAt, advisory.withdrawnAt);
      return {
        release: withoutSchema(version),
        status: advisory ? "withdrawn" : "available",
        advisory: advisory ?? null,
      };
    });
    const latest = versions.find((version) => version.status === "available") ?? null;
    const detail = {
      schemaVersion: 1,
      extension: { ...withoutHistoricalSources(withoutSchema(item.descriptor)), sourceAvailability },
      publisher: withoutSchema(item.publisher),
      trust,
      riskLabels,
      versions,
    };
    const fileName = `${id}.json`;
    expectedDetailFiles.add(fileName);
    const detailBytes = stableJson(detail);
    await writeFile(path.join(detailsDirectory, fileName), detailBytes, "utf8");
    catalogExtensions.push({
      id,
      name: item.descriptor.name,
      summary: item.descriptor.summary,
      type: item.descriptor.type,
      sourceAvailability,
      riskLabels,
      publisher: { id: item.publisher.id, displayName: item.publisher.displayName },
      trust,
      latestVersion: latest?.release.version ?? null,
      details: `extensions/${fileName}`,
      detailsSha256: createHash("sha256").update(detailBytes).digest("hex"),
    });
  }

  for (const entry of await readdir(detailsDirectory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json") && !expectedDetailFiles.has(entry.name)) {
      await unlink(path.join(detailsDirectory, entry.name));
    }
  }

  const catalog = { schemaVersion: 1, sourceDigest, updatedAt, extensions: catalogExtensions };
  await writeFile(path.join(registryDirectory, "catalog.v1.json"), stableJson(catalog), "utf8");
  return catalog;
}

function withoutHistoricalSources(extension) {
  const { historicalReleaseSources, ...publicExtension } = extension;
  return publicExtension;
}

function laterTimestamp(current, candidate) {
  if (!current || Date.parse(candidate) > Date.parse(current)) return candidate;
  return current;
}

function withoutSchema(value) {
  const { $schema: _schema, ...rest } = value;
  return rest;
}
