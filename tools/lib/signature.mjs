import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stableJson } from "./files.mjs";

export async function generateSigningKey(privateKeyPath, publicKeyPath) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  await mkdir(path.dirname(privateKeyPath), { recursive: true });
  await mkdir(path.dirname(publicKeyPath), { recursive: true });
  await writeFile(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeFile(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }), { encoding: "utf8", flag: "wx" });
}

export async function signRegistry(rootDirectory, privateKeyPath) {
  const catalogPath = path.join(rootDirectory, "registry", "catalog.v1.json");
  const publicKeyPath = path.join(rootDirectory, "registry", "catalog-public-key.pem");
  const signaturePath = path.join(rootDirectory, "registry", "catalog.v1.sig");
  const catalog = await readFile(catalogPath);
  const privateKey = createPrivateKey(await readFile(privateKeyPath, "utf8"));
  const publicKey = createPublicKey(privateKey);
  const publicPem = publicKey.export({ type: "spki", format: "pem" });
  const keyId = keyIdentifier(publicKey);
  const document = {
    schemaVersion: 1,
    algorithm: "ECDSA-P256-SHA256",
    keyId,
    catalogSha256: createHash("sha256").update(catalog).digest("hex"),
    signature: sign("sha256", catalog, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64"),
  };
  await writeFile(publicKeyPath, publicPem, "utf8");
  await writeFile(signaturePath, stableJson(document), "utf8");
  return document;
}

export async function verifyRegistrySignature(rootDirectory) {
  const catalog = await readFile(path.join(rootDirectory, "registry", "catalog.v1.json"));
  const document = JSON.parse(await readFile(path.join(rootDirectory, "registry", "catalog.v1.sig"), "utf8"));
  const publicKey = createPublicKey(await readFile(path.join(rootDirectory, "registry", "catalog-public-key.pem"), "utf8"));
  const digest = createHash("sha256").update(catalog).digest("hex");
  if (document.algorithm !== "ECDSA-P256-SHA256" || document.keyId !== keyIdentifier(publicKey)) {
    throw new Error("registry 签名算法或密钥 ID 不匹配");
  }
  if (document.catalogSha256 !== digest) throw new Error("registry catalog SHA-256 不匹配");
  if (!verify("sha256", catalog, { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(document.signature, "base64"))) {
    throw new Error("registry 签名无效");
  }
  return document;
}

function keyIdentifier(publicKey) {
  return createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
}
