import { createServer } from "node:http";
import { readConfig } from "./config.ts";
import { PortalStore } from "./store.ts";
import { createIntegrations } from "./integrations.ts";
import { PortalService } from "./service.ts";
import { createPortalHandler } from "./http.ts";

process.umask(0o077);
const config = readConfig();
const store = new PortalStore(config.database);
const service = new PortalService(store, createIntegrations(config), config);
const server = createServer(createPortalHandler(service, config));
server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.maxHeadersCount = 50;
server.listen(config.port, "127.0.0.1", () => console.log(`NODO portal API listening on loopback:${config.port}`));
const worker = setInterval(() => void service.workJobs().catch(() => console.error("Portal worker failed.")), 2000);
worker.unref();
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  clearInterval(worker);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 30_000).unref();
});
