import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", ".sites-runtime", ".wrangler", "dist", "node_modules", "out", "outputs", "work"]);
const ignoredFiles = new Set([".git", "source-lock.json", "tsconfig.tsbuildinfo"]);

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".env")) continue;
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await visit(absolute));
    else if (entry.isFile() && !ignoredFiles.has(entry.name)) files.push(absolute);
  }
  return files;
}

const paths = (await visit(root)).map((absolute) => path.relative(root, absolute).split(path.sep).join("/")).sort();
const files = [];
for (const relative of paths) {
  const content = await readFile(path.join(root, relative));
  files.push({ path: relative, sha256: createHash("sha256").update(content).digest("hex") });
}
const records = files.map((entry) => `${entry.sha256}  ${entry.path}`);
const aggregate_sha256 = createHash("sha256").update(`${records.join("\n")}\n`).digest("hex");
const lock = { schema_version: 1, algorithm: "sha256", aggregate_sha256, files };
await writeFile(path.join(root, "source-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
console.log(`Updated source lock: ${aggregate_sha256}`);
