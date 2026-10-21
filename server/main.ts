import { createServer } from "node:http";
import { readConfig } from "./config.ts";
import { PortalStore } from "./store.ts";
import { createIntegrations } from "./integrations.ts";
import { PortalService } from "./service.ts";
import { createApplicationHandler } from "./application.ts";
import { initializeRuntime } from "./runtime.ts";

process.umask(0o077);
const config = readConfig();
const store = new PortalStore(config.database);
initializeRuntime(store, config);
const service = new PortalService(store, createIntegrations(config), config);
const server = createServer(createApplicationHandler(service, config));
server.requestTimeout = 120_000;
server.headersTimeout = 15_000;
server.maxHeadersCount = 50;
server.listen(config.port, config.host, () => console.log(`Node Studio listening on ${config.host}:${config.port}`));
const worker = setInterval(() => void service.workJobs().catch(error => { service.errors.capture(error, { source: "runtime", operation: "worker" }); console.error("Portal worker failed."); }), 2000);
worker.unref();
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => {
  clearInterval(worker);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 30_000).unref();
});
