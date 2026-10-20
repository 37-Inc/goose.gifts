import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Local visual review only. Deployment must use workers/site's freshness guard.
const root = fileURLToPath(new URL("../out/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT || 4173);
http
  .createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.setHeader("Cache-Control", "no-store");
    if (url.pathname.startsWith("/api/")) {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({ error: "Connect the staging Worker for search." }),
      );
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const target = path.resolve(root, `.${pathname}`);
    if (
      !target.startsWith(`${root.replace(/\/$/, "")}/`) &&
      target !== root.replace(/\/$/, "")
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    for (const file of [
      pathname === "/" ? path.join(root, "index.html") : target,
      `${target}.html`,
    ]) {
      try {
        const info = await fs.stat(file);
        if (!info.isFile()) continue;
        const data = await fs.readFile(file);
        response.writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
        });
        response.end(data);
        return;
      } catch {
        /* Try the exported .html variant. */
      }
    }
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(await fs.readFile(path.join(root, "404.html")));
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Stupid Gifts local static preview: http://127.0.0.1:${port}`),
  );
