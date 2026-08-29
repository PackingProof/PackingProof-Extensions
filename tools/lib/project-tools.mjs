import { isDeepStrictEqual } from "node:util";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import yazl from "yazl";
import { once } from "node:events";
import { loadMarket } from "./market-validator.mjs";
import { validatePackage } from "./package-validator.mjs";
import { buildRegistry } from "./registry.mjs";
import { createSchemaValidator } from "./schemas.mjs";
import { stableJson } from "./files.mjs";
import { assertSafeRelativePath } from "./policy.mjs";
import { updateExtension } from "./releases.mjs";

const FIXED_ZIP_TIME = new Date("2000-01-01T00:00:00Z");

export async function initializeProject(projectDirectory, values) {
  const manifest = {
    $schema: "https://packingproof.dev/schemas/author-manifest.v1.schema.json",
    schemaVersion: 1,
    id: values.id,
    name: values.name,
    version: values.version,
    type: values.type,
    minPackingProofVersion: values.minPackingProofVersion,
    payload: values.payload,
  };
  const submission = {
    $schema: "https://packingproof.dev/schemas/submission.v1.schema.json",
    schemaVersion: 1,
    publisher: {
      schemaVersion: 1,
      id: values.publisherId,
      displayName: values.author,
      accounts: values.accounts,
      homepage: values.authorUrl,
    },
    extension: {
      schemaVersion: 1,
      id: values.id,
      publisherId: values.publisherId,
      name: values.name,
      summary: values.summary,
      description: values.description,
      type: values.type,
      ...(values.repository ? { repository: values.repository } : {}),
      homepage: values.homepage,
      license: values.license,
      sourceAvailability: values.sourceAvailability,
      releaseSources: values.releaseSources,
    },
  };
  const schema = await createSchemaValidator(path.resolve(import.meta.dirname, "../.."));
  schema.validate("author-manifest.v1.schema.json", manifest, "manifest.json");
  schema.validate("submission.v1.schema.json", submission, "submission.json");
  if (!values.id.startsWith(`${values.publisherId}.`)) {
    throw new Error("扩展 ID 必须使用 Publisher ID 前缀");
  }
  if (values.type === "userscript" && !values.payload.endsWith(".user.js")) {
    throw new Error("userscript payload 必须是 .user.js 文件");
  }
  await mkdir(path.join(projectDirectory, "payload"), { recursive: true });
  await writeFile(path.join(projectDirectory, "manifest.json"), stableJson(manifest), { encoding: "utf8", flag: "wx" });
  await writeFile(path.join(projectDirectory, "submission.json"), stableJson(submission), { encoding: "utf8", flag: "wx" });
  return { manifest, submission };
}

export async function packProject(projectDirectory, outputPath, repositoryRoot) {
  const schema = await createSchemaValidator(repositoryRoot);
  const authorManifest = JSON.parse(await readFile(path.join(projectDirectory, "manifest.json"), "utf8"));
  schema.validate("author-manifest.v1.schema.json", authorManifest, "manifest.json");
  const payloadPath = assertSafeRelativePath(authorManifest.payload, "manifest.payload");
  if (!payloadPath.startsWith("payload/")) throw new Error("payload 必须位于 payload/ 目录");
  if (authorManifest.type === "userscript" && !payloadPath.endsWith(".user.js")) {
    throw new Error("userscript payload 必须是 .user.js 文件");
  }
  const internalManifest = expandAuthorManifest(authorManifest);
  schema.validate("package-manifest.v1.schema.json", internalManifest, "生成的 PPEXT manifest");
  const files = await collectProjectFiles(projectDirectory);
  if (!files.includes(payloadPath)) throw new Error(`payload 文件不存在：${payloadPath}`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(stableJson(internalManifest)), "manifest.json", { mtime: FIXED_ZIP_TIME, mode: 0o100644 });
  for (const relativePath of files.filter(isPackageFile)) {
    zip.addFile(path.join(projectDirectory, relativePath), relativePath, { mtime: FIXED_ZIP_TIME, mode: 0o100644 });
  }
  zip.end();
  const stream = (await import("node:fs")).createWriteStream(outputPath, { flags: "wx" });
  zip.outputStream.pipe(stream);
  await once(stream, "close");
  await validatePackage(outputPath, schema);
  return { outputPath, manifest: internalManifest };
}

export async function submitProject(repositoryRoot, projectDirectory) {
  const schema = await createSchemaValidator(repositoryRoot);
  const authorManifest = JSON.parse(await readFile(path.join(projectDirectory, "manifest.json"), "utf8"));
  const submission = JSON.parse(await readFile(path.join(projectDirectory, "submission.json"), "utf8"));
  schema.validate("author-manifest.v1.schema.json", authorManifest, "manifest.json");
  schema.validate("submission.v1.schema.json", submission, "submission.json");
  for (const key of ["id", "name", "type"]) {
    if (submission.extension[key] !== authorManifest[key]) {
      throw new Error(`submission.extension.${key} 与 manifest.json 不一致`);
    }
  }
  const publisherPath = path.join(repositoryRoot, "publishers", `${submission.publisher.id}.json`);
  const extensionDirectory = path.join(repositoryRoot, "extensions", submission.extension.id);
  const extensionPath = path.join(extensionDirectory, "extension.json");
  const created = [];
  const generatedVersions = [];
  try {
    await writeNewOrEqual(publisherPath, submission.publisher, created);
    await writeNewOrEqual(extensionPath, submission.extension, created);
    const market = await loadMarket(repositoryRoot);
    const versions = await updateExtension(repositoryRoot, market, submission.extension.id, {
      onlyVersion: authorManifest.version,
    });
    generatedVersions.push(...versions);
    if (!versions.length && !(await fileExists(path.join(extensionDirectory, "versions", `${authorManifest.version}.json`)))) {
      throw new Error(`发布源中没有找到 ${submission.extension.id}-${authorManifest.version}.ppext`);
    }
    await buildRegistry(repositoryRoot, await loadMarket(repositoryRoot));
    return { publisherPath, extensionPath, versions };
  } catch (error) {
    for (const filePath of generatedVersions.reverse()) await rm(filePath, { force: true });
    for (const filePath of created.reverse()) await rm(filePath, { force: true });
    throw error;
  }
}

export function expandAuthorManifest(manifest) {
  return {
    schemaVersion: 1,
    format: "packingproof-extension",
    packageFormatVersion: 1,
    id: manifest.id,
    version: manifest.version,
    type: manifest.type,
    installation: manifest.type === "userscript"
      ? { mode: "userscript-import", payloadPath: manifest.payload }
      : { mode: "manual-external", suggestedPath: manifest.payload },
    compatibility: {
      minPackingProofVersion: manifest.minPackingProofVersion,
      platforms: manifest.type === "userscript"
        ? { userscript: ["any"] }
        : { windows: ["any"] },
    },
    access: {
      packingProofPermissions: [],
      packingProofCapabilities: [],
      systemAccess: [],
    },
  };
}

async function collectProjectFiles(projectDirectory) {
  const result = [];
  async function visit(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) throw new Error(`项目中不允许符号链接：${relativePath}`);
      if (info.isDirectory()) await visit(fullPath, relativePath);
      else if (info.isFile()) result.push(assertSafeRelativePath(relativePath.replaceAll("\\", "/"), "项目文件"));
    }
  }
  await visit(projectDirectory, "");
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

function isPackageFile(relativePath) {
  return relativePath.startsWith("payload/") || relativePath === "README.md" || relativePath === "icon.png";
}

async function writeNewOrEqual(filePath, value, created) {
  const existing = await readFile(filePath, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    const { $schema: _existingSchema, ...existingValue } = existing;
    const { $schema: _newSchema, ...newValue } = value;
    if (!isDeepStrictEqual(existingValue, newValue)) throw new Error(`已有登记与 submission.json 不一致：${filePath}`);
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stableJson(value), { encoding: "utf8", flag: "wx" });
  created.push(filePath);
}

async function fileExists(filePath) {
  return lstat(filePath).then(() => true, (error) => error.code === "ENOENT" ? false : Promise.reject(error));
}
