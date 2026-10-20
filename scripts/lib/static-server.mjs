import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function createStaticServer(directory) {
  const root = resolve(directory);
  return createServer(async (request, response) => {
    try {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      } catch {
        response.writeHead(400).end("Bad request");
        return;
      }
      let filename = resolve(root, `.${pathname}`);
      if (filename !== root && !filename.startsWith(root + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      try {
        if ((await stat(filename)).isDirectory()) filename = resolve(filename, "index.html");
      } catch { /* Fall through to the 404 document. */ }
      let status = 200;
      let content;
      try {
        content = await readFile(filename);
      } catch {
        status = 404;
        filename = resolve(root, "404.html");
        content = await readFile(filename);
      }
      response.writeHead(status, {
        "Content-Type": contentTypes[extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      response.writeHead(500).end("Server error");
    }
  });
}
