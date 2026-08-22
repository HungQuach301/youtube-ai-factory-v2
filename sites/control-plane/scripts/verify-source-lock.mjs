import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const lock = JSON.parse(await readFile(path.join(root, "source-lock.json"), "utf8"));
const records = [];

for (const entry of lock.files) {
  const content = await readFile(path.join(root, entry.path));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== entry.sha256) throw new Error(`Source drift detected: ${entry.path}`);
  records.push(`${entry.sha256}  ${entry.path}`);
}

const aggregate = createHash("sha256").update(`${records.join("\n")}\n`).digest("hex");
if (aggregate !== lock.aggregate_sha256) throw new Error("Source lock aggregate does not match managed files");
console.log(`Canonical source verified: ${aggregate.slice(0, 16)}`);
