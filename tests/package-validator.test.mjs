import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validatePackage } from "../tools/lib/package-validator.mjs";
import { createSchemaValidator } from "../tools/lib/schemas.mjs";
import { externalManifest, userscriptManifest, writeZip } from "./helpers.mjs";

const rootDirectory = path.resolve(import.meta.dirname, "..");

test("validates userscript package and normalizes X.Y metadata version", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppx-userscript-"));
  try {
    const filePath = path.join(temporary, "sample.ppx");
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppx-adapter-"));
  try {
    const filePath = path.join(temporary, "sample.ppx");
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppx-traversal-"));
  try {
    const filePath = path.join(temporary, "sample.ppx");
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
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ppx-ratio-"));
  try {
    const filePath = path.join(temporary, "sample.ppx");
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
