import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf",
};

/** Serve only the immutable Next.js export. API source and the database are outside this root. */
export function createStaticHandler(directory: string) {
  const root = resolve(directory);
  const withinRoot = (path: string) => path === root || path.startsWith(root + sep);
  return async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    function reject(status: number, message: string) {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(request.method === "HEAD" ? undefined : message);
    }
    try {
      if (request.method !== "GET" && request.method !== "HEAD") { response.setHeader("Allow", "GET, HEAD"); reject(405, "Method not allowed"); return; }
      let pathname: string;
      try { pathname = "/" + decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^\/+/, ""); }
      catch { reject(400, "Bad request"); return; }
      if (pathname.includes("\0")) { reject(400, "Bad request"); return; }
      if (pathname.split("/").some(part => part.startsWith("."))) { reject(404, "Not found"); return; }
      let filename = resolve(root, `.${pathname}`);
      if (!withinRoot(filename)) { reject(403, "Forbidden"); return; }
      let status = 200;
      let info;
      try {
        info = await stat(filename);
        if (info.isDirectory()) {
          if (!pathname.endsWith("/")) {
            const query = new URL(request.url ?? "/", "http://localhost").search;
            response.writeHead(308, { Location: `${encodeURI(pathname)}/${query}`, "Cache-Control": "no-cache" }); response.end(); return;
          }
          filename = resolve(filename, "index.html"); info = await stat(filename);
        }
        if (!info.isFile()) throw new Error("Not a regular file");
        filename = await realpath(filename);
        if (!withinRoot(filename)) { reject(403, "Forbidden"); return; }
      } catch {
        status = 404; filename = resolve(root, "404.html"); info = await stat(filename);
      }
      const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      const headers: Record<string, string | number> = {
        "Content-Type": contentTypes[extname(filename)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": status === 200 && pathname.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
        "Accept-Ranges": "bytes", ETag: etag, "Last-Modified": info.mtime.toUTCString(),
      };
      if (status === 200 && request.headers["if-none-match"] === etag) { response.writeHead(304, headers); response.end(); return; }
      let start = 0; let end = info.size - 1;
      const range = request.headers.range;
      if (status === 200 && range && (!request.headers["if-range"] || request.headers["if-range"] === headers["Last-Modified"])) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
        } else { start = info.size; }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
          response.setHeader("Content-Range", `bytes */${info.size}`); reject(416, "Range not satisfiable"); return;
        }
        status = 206; headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
      }
      headers["Content-Length"] = Math.max(0, end - start + 1);
      response.writeHead(status, headers);
      if (request.method === "HEAD" || info.size === 0) { response.end(); return; }
      await pipeline(createReadStream(filename, { start, end }), response);
    } catch {
      if (!response.headersSent) reject(500, "Server error");
      else response.destroy();
    }
  };
}
