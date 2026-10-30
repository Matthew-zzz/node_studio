import { readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { compressibleExtensions } from "./static-encoding.mjs";

const compress = promisify(gzip);

/** Build sidecars only; originals remain the authoritative, usable fallback. */
export async function precompress(directory) {
  const result = { files: 0, originalBytes: 0, gzipBytes: 0 };
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) { await visit(path); continue; }
      if (!entry.isFile() || !compressibleExtensions.has(extname(path))) continue;
      const info = await stat(path);
      const original = await readFile(path);
      const compressed = original.length >= 1024 ? await compress(original, { level: 9 }) : null;
      if (!compressed || compressed.length >= original.length) {
        await rm(`${path}.gz`, { force: true });
        continue;
      }
      await writeFile(`${path}.gz`, compressed);
      await utimes(`${path}.gz`, info.atime, info.mtime);
      result.files++;
      result.originalBytes += original.length;
      result.gzipBytes += compressed.length;
    }
  }
  await visit(directory);
  return result;
}
