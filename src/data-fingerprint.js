import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

async function filesBelow(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesBelow(root, path));
    } else if (entry.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Unsupported supplemental data entry: ${path}`);
    }
  }
  return files;
}

export async function fingerprintDirectory(directory) {
  const files = await filesBelow(directory);
  const normalized = files
    .map((path) => ({
      path,
      relativePath: relative(directory, path).split(sep).join("/"),
    }))
    .sort((left, right) =>
      left.relativePath < right.relativePath
        ? -1
        : left.relativePath > right.relativePath
          ? 1
          : 0,
    );
  const hash = createHash("sha256");
  for (const file of normalized) {
    const contents = await readFile(file.path);
    hash.update(file.relativePath, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(contents.length), "utf8");
    hash.update("\0", "utf8");
    hash.update(contents);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}
