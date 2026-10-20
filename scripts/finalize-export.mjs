import { cp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, process.env.SITE_OUTPUT_DIR || "dist");
const cache = resolve(root, ".cache") + sep;

// Docker consumes dist/; an isolated local build may use a directory under .cache/.
if (output !== resolve(root, "dist") && !output.startsWith(cache)) {
  throw new Error("SITE_OUTPUT_DIR must be dist/ or a subdirectory of .cache/");
}

await rm(output, { recursive: true, force: true });
await cp(resolve(root, "out"), output, { recursive: true });
console.log(`Next.js static export is ready: ${output}`);
