import type { IncomingMessage, ServerResponse } from "node:http";
import type { PortalService } from "./service.ts";
import type { PortalConfig } from "./config.ts";
import { createPortalHandler } from "./http.ts";
import { createStaticHandler } from "./static.ts";

export function createApplicationHandler(service: PortalService, config: PortalConfig) {
  const api = createPortalHandler(service, config);
  const frontend = config.staticDirectory ? createStaticHandler(config.staticDirectory) : null;
  return async function handle(request: IncomingMessage, response: ServerResponse) {
    let path;
    try { path = new URL(request.url ?? "/", config.origin).pathname; }
    catch { response.writeHead(400).end("Bad request"); return; }
    if (path === "/api" || path.startsWith("/api/")) return api(request, response);
    if (frontend) return frontend(request, response);
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  };
}
