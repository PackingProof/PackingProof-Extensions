import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { downloadPackage, validatePackage } from "../tools/lib/package-validator.mjs";
import { createSchemaValidator } from "../tools/lib/schemas.mjs";
import { externalManifest, userscriptManifest, writeZip } from "./helpers.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");

test("allows Gitee release redirects to its current asset host", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-gitee-download-"));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const response = new Response(Buffer.from("ppext"), {
        status: 200,
        headers: { "content-length": "5" },
      });
      Object.defineProperty(response, "url", {
        value: "https://foruda.gitee.com/attach_file/example/sample.ppext",
      });
      return response;
    };
    const destination = path.join(temporary, "sample.ppext");
    assert.equal(await downloadPackage(
      "https://gitee.com/SampleOrg/Demo/releases/download/v1.0.0/sample.ppext",
      destination,
    ), 5);
    assert.equal(await readFile(destination, "utf8"), "ppext");
  } finally {
    globalThis.fetch = originalFetch;
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects legacy extension names and packages without the PackingProof format marker", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-identity-"));
  try {
    const legacyPath = path.join(temporary, "sample.ppx");
    await writeFile(legacyPath, "legacy", "utf8");
    await assert.rejects(
      validatePackage(legacyPath, await createSchemaValidator(rootDirectory)),
      /必须使用 \.ppext 文件名/,
    );

    const filePath = path.join(temporary, "sample.ppext");
    const { format: _format, ...manifest } = externalManifest();
    await writeZip(filePath, [
      ["manifest.json", JSON.stringify(manifest)],
      ["payload/adapter.exe", Buffer.from([1, 2, 3])],
    ]);
    await assert.rejects(
      validatePackage(filePath, await createSchemaValidator(rootDirectory)),
      /format/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("validates userscript package and normalizes X.Y metadata version", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-userscript-"));
  try {
    const filePath = path.join(temporary, "sample.ppext");
    const manifest = userscriptManifest();
    await writeZip(filePath, [
      ["manifest.json", JSON.stringify(manifest)],
      ["payload/main.user.js", "// ==UserScript==\n// @name Demo\n// @version 1.2\n// ==/UserScript==\n"],
    ]);
    const schema = await createSchemaValidator(rootDirectory);
    const result = await validatePackage(filePath, schema);
    assert.equal(result.manifest.id, "sample.demo");
    assert.deepEqual(result.warnings, []);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("warns when an external adapter omits README", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-adapter-"));
  try {
    const filePath = path.join(temporary, "sample.ppext");
    await writeZip(filePath, [
      ["manifest.json", JSON.stringify(externalManifest())],
      ["payload/adapter.exe", Buffer.from([1, 2, 3, 4, 5])],
    ]);
    const result = await validatePackage(filePath, await createSchemaValidator(rootDirectory));
    assert.deepEqual(result.warnings, ["外部适配器未包含 README.md"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects path traversal before extraction", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-traversal-"));
  try {
    const filePath = path.join(temporary, "sample.ppext");
    const manifest = externalManifest({
      installation: { mode: "manual-external", suggestedPath: "payload/a.txt" },
    });
    await writeZip(filePath, [
      ["manifest.json", JSON.stringify(manifest)],
      ["payload/a.txt", "safe"],
    ]);
    const bytes = await readFile(filePath);
    const original = Buffer.from("payload/a.txt");
    const malicious = Buffer.from("../evil/a.txt");
    let replaced = 0;
    for (let offset = bytes.indexOf(original); offset >= 0; offset = bytes.indexOf(original, offset + malicious.length)) {
      malicious.copy(bytes, offset);
      replaced += 1;
    }
    assert.ok(replaced >= 2);
    await writeFile(filePath, bytes);
    await assert.rejects(
      validatePackage(filePath, await createSchemaValidator(rootDirectory)),
      /不安全的相对路径|invalid relative path/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("rejects suspicious compression ratios from the central directory", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppext-ratio-"));
  try {
    const filePath = path.join(temporary, "sample.ppext");
    await writeZip(filePath, [
      ["manifest.json", JSON.stringify(externalManifest())],
      ["payload/adapter.exe", Buffer.alloc(300_000)],
    ]);
    await assert.rejects(
      validatePackage(filePath, await createSchemaValidator(rootDirectory)),
      /压缩比超过 200:1/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
