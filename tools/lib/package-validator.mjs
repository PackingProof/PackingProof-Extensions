import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isDeepStrictEqual, promisify } from "node:util";
import yauzl from "yauzl";
import semver from "semver";
import {
  MAX_COMPRESSION_RATIO,
  MAX_ENTRY_COUNT,
  MAX_EXPANDED_BYTES,
  MAX_PACKAGE_BYTES,
  MAX_USERSCRIPT_BYTES,
  assertSafeRelativePath,
} from "./policy.mjs";

const openZip = promisify(yauzl.open);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export async function downloadPackage(url, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(300_000),
    headers: { "user-agent": "PackingProof-Extensions-Validator/1" },
  });
  if (!response.ok || !response.body) throw new Error(`下载失败 ${response.status}：${url}`);
  assertAllowedRedirect(url, response.url);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_PACKAGE_BYTES) throw new Error(`扩展包超过 200 MB：${url}`);
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_PACKAGE_BYTES) callback(new Error("扩展包超过 200 MB"));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(destinationPath, { flags: "wx" }));
  } catch (error) {
    await unlink(destinationPath).catch(() => {});
    throw error;
  }
  return received;
}

function assertAllowedRedirect(originalUrl, finalUrl) {
  const originalHost = new URL(originalUrl).hostname.toLowerCase();
  const finalHost = new URL(finalUrl).hostname.toLowerCase();
  const allowed = originalHost === "github.com"
    ? new Set(["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"])
    : new Set(["gitee.com", "files.gitee.com", "foruda.gitee.com"]);
  if (!allowed.has(finalHost)) throw new Error(`下载重定向到了未授权域名：${finalHost}`);
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
  }), new Transform({ transform(_chunk, _encoding, callback) { callback(); } }));
  return hash.digest("hex");
}

export async function validatePackage(filePath, schema, expected = null) {
  if (path.extname(filePath).toLowerCase() !== ".ppext") {
    throw new Error(`${filePath}: 扩展包必须使用 .ppext 文件名`);
  }
  const packageSize = (await stat(filePath)).size;
  if (packageSize <= 0 || packageSize > MAX_PACKAGE_BYTES) throw new Error(`${filePath}: 包大小超限`);
  const zip = await openZip(filePath, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true });
  const names = new Set();
  const entries = new Map();
  let entryCount = 0;
  let declaredExpanded = 0;
  let actualExpanded = 0;
  let manifestBytes = null;
  let userscriptBytes = null;

  try {
    await new Promise((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", resolve);
      zip.on("entry", async (entry) => {
        try {
          entryCount += 1;
          if (entryCount > MAX_ENTRY_COUNT) throw new Error("文件数量超过 2000");
          if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error(`不允许加密文件：${entry.fileName}`);
          const normalized = assertSafeRelativePath(entry.fileName.replace(/\/$/, ""), filePath);
          for (const segment of normalized.split("/")) {
            if (segment.endsWith(".") || segment.endsWith(" ") || WINDOWS_RESERVED_NAME.test(segment)) {
              throw new Error(`不允许 Windows 保留或别名文件名：${entry.fileName}`);
            }
          }
          const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (unixMode === 0o120000) throw new Error(`不允许符号链接：${entry.fileName}`);
          const caseKey = normalized.toLowerCase();
          if (names.has(caseKey)) throw new Error(`存在大小写冲突或重复路径：${entry.fileName}`);
          names.add(caseKey);
          entries.set(normalized, entry);
          declaredExpanded += entry.uncompressedSize;
          if (declaredExpanded > MAX_EXPANDED_BYTES) throw new Error("声明展开大小超过 500 MB");
          const ratio = entry.compressedSize === 0
            ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
            : entry.uncompressedSize / entry.compressedSize;
          if (ratio > MAX_COMPRESSION_RATIO) throw new Error(`压缩比超过 200:1：${entry.fileName}`);

          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error) return reject(error);
            const chunks = [];
            let entryBytes = 0;
            stream.on("data", (chunk) => {
              entryBytes += chunk.length;
              actualExpanded += chunk.length;
              if (actualExpanded > MAX_EXPANDED_BYTES) stream.destroy(new Error("实际展开大小超过 500 MB"));
              if (normalized === "manifest.json" && entryBytes <= 64 * 1024) chunks.push(chunk);
            });
            stream.on("error", reject);
            stream.on("end", () => {
              if (normalized === "manifest.json") {
                if (entryBytes > 64 * 1024) return reject(new Error("manifest.json 不能超过 64 KB"));
                manifestBytes = Buffer.concat(chunks);
              }
              zip.readEntry();
            });
          });
        } catch (error) {
          reject(error);
        }
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }

  if (!manifestBytes) throw new Error(`${filePath}: 缺少根目录 manifest.json`);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${filePath}: manifest.json 无效：${error.message}`);
  }
  schema.validate("package-manifest.v1.schema.json", manifest, `${filePath}!manifest.json`);
  validateInstallation(manifest, entries, filePath);
  validateManifestMatch(manifest, expected, filePath);

  if (manifest.type === "userscript") {
    const payload = manifest.installation.payloadPath;
    const entry = entries.get(payload);
    if (entry.uncompressedSize > MAX_USERSCRIPT_BYTES) throw new Error(`${filePath}: 油猴脚本超过 1 MB`);
    userscriptBytes = await readZipEntry(filePath, payload, MAX_USERSCRIPT_BYTES);
    const versionMatch = userscriptBytes.toString("utf8").match(/^\/\/\s*@version\s+([^\r\n]+)/m);
    if (!versionMatch) throw new Error(`${filePath}: 油猴脚本缺少 @version`);
    const normalized = normalizeUserscriptVersion(versionMatch[1].trim());
    if (normalized !== manifest.version) throw new Error(`${filePath}: 油猴脚本版本与 manifest 不一致`);
  }

  return {
    manifest,
    packageSize,
    warnings: manifest.type === "external-adapter" && !entries.has("README.md")
      ? ["外部适配器未包含 README.md"]
      : [],
  };
}

function validateInstallation(manifest, entries, label) {
  const installation = manifest.installation;
  const payloadPath = installation.payloadPath ?? installation.suggestedPath;
  assertSafeRelativePath(payloadPath, label);
  if (!entries.has(payloadPath)) throw new Error(`${label}: 安装入口不存在：${payloadPath}`);
  if (manifest.type === "userscript" && installation.mode !== "userscript-import") {
    throw new Error(`${label}: userscript 必须使用 userscript-import`);
  }
  if (manifest.type === "external-adapter" && installation.mode !== "manual-external") {
    throw new Error(`${label}: external-adapter 必须使用 manual-external`);
  }
}

function validateManifestMatch(manifest, expected, label) {
  if (!expected) return;
  for (const key of ["id", "version", "type"]) {
    if (manifest[key] !== expected[key]) throw new Error(`${label}: manifest.${key} 与市场清单不一致`);
  }
  for (const key of ["compatibility", "access"]) {
    if (!isDeepStrictEqual(manifest[key], expected[key])) {
      throw new Error(`${label}: manifest.${key} 与市场清单不一致`);
    }
  }
}

function normalizeUserscriptVersion(value) {
  if (/^\d+\.\d+$/.test(value)) return `${value}.0`;
  return semver.valid(value) && !semver.prerelease(value) ? value : null;
}

async function readZipEntry(filePath, entryName, limit) {
  const zip = await openZip(filePath, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true });
  try {
    return await new Promise((resolve, reject) => {
      zip.on("error", reject);
      zip.on("end", () => reject(new Error(`ZIP 条目不存在：${entryName}`)));
      zip.on("entry", (entry) => {
        if (entry.fileName !== entryName) return zip.readEntry();
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          let total = 0;
          stream.on("data", (chunk) => {
            total += chunk.length;
            if (total > limit) stream.destroy(new Error(`ZIP 条目超过限制：${entryName}`));
            else chunks.push(chunk);
          });
          stream.on("error", reject);
          stream.on("end", () => resolve(Buffer.concat(chunks)));
        });
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
}
