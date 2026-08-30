import { access } from "node:fs/promises";
import path from "node:path";

export async function resolveSigningKeyPath(rootDirectory, commandLinePath, environmentPath) {
  const defaultPath = path.join(rootDirectory, ".env", "market-signing-key.pem");
  const configuredPath = commandLinePath ?? environmentPath ?? defaultPath;
  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(rootDirectory, configuredPath);

  try {
    await access(resolvedPath);
  } catch {
    if (!commandLinePath && !environmentPath) {
      throw new Error("未找到市场签名私钥，请将现有私钥放到 .env/market-signing-key.pem，或使用 --key / PACKINGPROOF_MARKET_SIGNING_KEY 指定路径");
    }
    throw new Error(`找不到市场签名私钥：${resolvedPath}`);
  }

  return resolvedPath;
}
