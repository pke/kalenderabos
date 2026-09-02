import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const targetDirectory = resolve(
  process.env.OPENHOLIDAYS_DATA_DIR || resolve(projectDirectory, ".cache/openholidaysapi.data"),
);

function git(args) {
  execFileSync("git", args, { stdio: "inherit" });
}

if (existsSync(resolve(targetDirectory, ".git"))) {
  git(["-C", targetDirectory, "fetch", "--depth", "1", "origin", "main"]);
  git(["-C", targetDirectory, "checkout", "--detach", "FETCH_HEAD"]);
} else {
  git([
    "clone",
    "--depth",
    "1",
    "--branch",
    "main",
    "https://github.com/openpotato/openholidaysapi.data.git",
    targetDirectory,
  ]);
}
