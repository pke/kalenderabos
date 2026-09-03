import { events } from "./lib/events.js";
import { generateICal } from "./lib/ical.js";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const outputDirectory = resolve(projectDirectory, "www");
const ical = generateICal(events);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectDirectory, "public"), outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "aesales.ics"), ical, "utf8");
await writeFile(resolve(outputDirectory, ".nojekyll"), "", "utf8");

console.log(`Generated ${events.length} events → www/aesales.ics`);
