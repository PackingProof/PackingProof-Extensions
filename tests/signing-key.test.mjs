import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveSigningKeyPath } from "../tools/lib/signing-key.mjs";

test("uses the ignored repository key path by default", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "registry-signing-key-"));
  try {
    const defaultPath = path.join(root, ".env", "market-signing-key.pem");
    await mkdir(path.dirname(defaultPath), { recursive: true });
    await writeFile(defaultPath, "test key", "utf8");
    assert.equal(await resolveSigningKeyPath(root), defaultPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prefers the command line key over the environment key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "registry-signing-key-"));
  try {
    const commandLinePath = path.join(root, "command-line.pem");
    const environmentPath = path.join(root, "environment.pem");
    await writeFile(commandLinePath, "command line key", "utf8");
    await writeFile(environmentPath, "environment key", "utf8");
    assert.equal(
      await resolveSigningKeyPath(root, commandLinePath, environmentPath),
      commandLinePath,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prefers the environment key over the default repository key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "registry-signing-key-"));
  try {
    const defaultPath = path.join(root, ".env", "market-signing-key.pem");
    const environmentPath = path.join(root, "environment.pem");
    await mkdir(path.dirname(defaultPath), { recursive: true });
    await writeFile(defaultPath, "default key", "utf8");
    await writeFile(environmentPath, "environment key", "utf8");
    assert.equal(
      await resolveSigningKeyPath(root, null, environmentPath),
      environmentPath,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports how to configure a missing default key", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "registry-signing-key-"));
  try {
    await assert.rejects(
      resolveSigningKeyPath(root),
      /\.env\/market-signing-key\.pem/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
