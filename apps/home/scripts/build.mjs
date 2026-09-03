import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectDirectory, "www");

await rm(outputDirectory, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
});
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectDirectory, "public"), outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, ".nojekyll"), "", "utf8");
await writeFile(resolve(outputDirectory, "CNAME"), "kalenderabos.de\n", "utf8");

process.stdout.write(`Generated ${outputDirectory}\n`);
