import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./lib/static-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, process.env.SITE_OUTPUT_DIR || "dist");
const port = Number(process.env.PORT || 4173);
const server = createStaticServer(directory);

server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => console.log(`Local: http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
