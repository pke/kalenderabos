import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprintDirectory } from "../src/data-fingerprint.js";

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const supplementDirectory = resolve(
  process.argv[2] || resolve(projectDirectory, "data/supplements"),
);

process.stdout.write(`${await fingerprintDirectory(supplementDirectory)}\n`);
