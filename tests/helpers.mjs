import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import yazl from "yazl";

export async function writeZip(filePath, entries) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const zip = new yazl.ZipFile();
  for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
  zip.end();
  const output = (await import("node:fs")).createWriteStream(filePath);
  zip.outputStream.pipe(output);
  await once(output, "close");
}

export function userscriptManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    packageFormatVersion: 1,
    id: "sample.demo",
    version: "1.2.0",
    type: "userscript",
    installation: {
      mode: "userscript-import",
      payloadPath: "payload/main.user.js",
    },
    compatibility: {
      minPackingProofVersion: "0.0.62",
      platforms: { userscript: ["any"] },
    },
    access: {
      packingProofPermissions: ["orders.write"],
      packingProofCapabilities: [],
      systemAccess: [{ id: "network", reason: "连接 PackingProof 工位" }],
    },
    ...overrides,
  };
}

export function externalManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    packageFormatVersion: 1,
    id: "sample.adapter",
    version: "1.0.0",
    type: "external-adapter",
    installation: {
      mode: "manual-external",
      suggestedPath: "payload/adapter.exe",
    },
    compatibility: {
      minPackingProofVersion: "0.0.62",
      platforms: { windows: ["x64"] },
    },
    access: {
      packingProofPermissions: ["scan-tasks.read", "scan-results.write"],
      packingProofCapabilities: ["order.lookup"],
      systemAccess: [{ id: "network", reason: "访问 ERP 与 PackingProof API" }],
    },
    ...overrides,
  };
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
