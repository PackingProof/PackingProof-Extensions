import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateSigningKey, signRegistry, verifyRegistrySignature } from "../tools/lib/signature.mjs";

test("signs the exact catalog bytes and rejects later changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "registry-signature-"));
  try {
    await mkdir(path.join(root, "registry"), { recursive: true });
    await writeFile(path.join(root, "registry", "catalog.v1.json"), "{\"schemaVersion\":1}\n", "utf8");
    const privateKey = path.join(root, "private.pem");
    await generateSigningKey(privateKey, path.join(root, "registry", "catalog-public-key.pem"));
    const signed = await signRegistry(root, privateKey);
    assert.equal((await verifyRegistrySignature(root)).keyId, signed.keyId);
    await writeFile(path.join(root, "registry", "catalog.v1.json"), "{\"schemaVersion\":2}\n", "utf8");
    await assert.rejects(verifyRegistrySignature(root), /SHA-256 不匹配/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
