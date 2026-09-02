import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 8791);
const host = process.env.HOST || "0.0.0.0";
const outputDirectory = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function localAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let relative;
  try {
    const url = new URL(request.url || "/", "http://localhost");
    relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
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
  const urls = ["127.0.0.1", ...localAddresses()]
    .map((address) => `http://${address}:${port}/`)
    .join("\n");
  process.stdout.write(`Static calendar site:\n${urls}\n`);
});
