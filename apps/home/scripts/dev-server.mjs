import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 8790);
const host = process.env.HOST || "0.0.0.0";
const outputDirectory = resolve(fileURLToPath(new URL("../www/", import.meta.url)));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let relative;
  try {
    const url = new URL(request.url || "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname !== "/" && !pathname.endsWith("/") && !extname(pathname)) {
      const directoryIndex = resolve(outputDirectory, pathname.slice(1), "index.html");
      try {
        await readFile(directoryIndex);
        response.writeHead(308, { Location: `${pathname}/${url.search}` });
        response.end();
        return;
      } catch {
        // Continue to the regular not-found response.
      }
    }
    relative = pathname === "/"
      ? "index.html"
      : `${pathname.slice(1)}${pathname.endsWith("/") ? "index.html" : ""}`;
  } catch {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  const path = resolve(outputDirectory, relative);
  if (path !== outputDirectory && !path.startsWith(`${outputDirectory}${sep}`)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  try {
    const file = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(path).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": file.byteLength,
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}).listen(port, host, () => {
  process.stdout.write(`Homepage: http://127.0.0.1:${port}/\n`);
});
