import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: JSON 读取失败：${error.message}`);
  }
}

export async function listJsonFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function listDirectories(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right, "en"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function fileSize(filePath) {
  return (await stat(filePath)).size;
}

export function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((key) => [key, stableObject(value[key])]),
  );
}

export function stableJson(value) {
  return `${JSON.stringify(stableObject(value), null, 2)}\n`;
}
