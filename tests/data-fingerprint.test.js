import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fingerprintDirectory } from "../src/data-fingerprint.js";

test("supplement fingerprint is deterministic and changes with content", async () => {
  const first = await mkdtemp(join(tmpdir(), "supplement-fingerprint-a-"));
  const second = await mkdtemp(join(tmpdir(), "supplement-fingerprint-b-"));
  await mkdir(join(first, "nested"));
  await mkdir(join(second, "nested"));

  await writeFile(join(first, "b.txt"), "second\n");
  await writeFile(join(first, "nested", "a.txt"), "first\n");
  await writeFile(join(second, "nested", "a.txt"), "first\n");
  await writeFile(join(second, "b.txt"), "second\n");

  const original = await fingerprintDirectory(first);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(await fingerprintDirectory(second), original);

  await writeFile(join(second, "b.txt"), "changed\n");
  assert.notEqual(await fingerprintDirectory(second), original);
});
