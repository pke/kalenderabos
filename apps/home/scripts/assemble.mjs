import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectDirectory, "www");
const applications = [
  { packageName: "school-holidays", route: "schulferien", rootAssets: [] },
  { packageName: "aliexpress-sales", route: "aesales", rootAssets: ["aesales.ics"] },
];

for (const { packageName, route, rootAssets } of applications) {
  const source = resolve(projectDirectory, "..", packageName, "www");
  const target = resolve(outputDirectory, route);
  await rm(target, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
  await cp(source, target, { recursive: true });
  for (const asset of rootAssets) {
    await cp(resolve(source, asset), resolve(outputDirectory, asset));
    await rm(resolve(target, asset), { force: true });
  }
}

process.stdout.write(`Assembled ${applications.length} applications in ${outputDirectory}\n`);
