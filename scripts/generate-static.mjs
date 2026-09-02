import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStaticData } from "../src/static-generator.js";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function git(sourceDirectory, ...args) {
  return execFileSync("git", ["-C", sourceDirectory, ...args], {
    encoding: "utf8",
  }).trim();
}

function contains(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDirectory = resolve(option(
  "source",
  process.env.OPENHOLIDAYS_DATA_DIR || resolve(projectDirectory, ".cache/openholidaysapi.data"),
));
const supplementDirectory = resolve(option(
  "supplements",
  process.env.HOLIDAY_SUPPLEMENT_DIR || resolve(projectDirectory, "data/supplements"),
));
const outputDirectory = resolve(option("output", resolve(projectDirectory, "dist")));
const generatedAt = option("generated-at", process.env.BUILD_TIMESTAMP || new Date().toISOString());
const sourceCommit = option("commit", process.env.SOURCE_COMMIT || git(sourceDirectory, "rev-parse", "HEAD"));
const sourceTreeSha = option(
  "tree",
  process.env.SOURCE_TREE_SHA || git(sourceDirectory, "rev-parse", `${sourceCommit}:src`),
);

if (contains(outputDirectory, projectDirectory) || contains(outputDirectory, sourceDirectory)) {
  throw new Error(`Refusing to replace unsafe output directory: ${outputDirectory}`);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectDirectory, "public"), outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, ".nojekyll"), "", "utf8");
await writeFile(resolve(outputDirectory, "CNAME"), "schulferien.kalenderabos.de\n", "utf8");

const { manifest } = await buildStaticData({
  sourceDirectory,
  supplementDirectory,
  outputDirectory,
  sourceCommit,
  sourceTreeSha,
  generatedAt,
});

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
