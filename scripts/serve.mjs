import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStaticServer } from "./lib/static-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, process.env.SITE_OUTPUT_DIR || "dist");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const server = createStaticServer(directory);

server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Node Studio static site listening on ${host}:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
