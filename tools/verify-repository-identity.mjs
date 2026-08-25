import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const EXPECTED_REPOSITORY = "HungQuach301/youtube-ai-factory-v2";
export const PROHIBITED_REPOSITORY = "HungQuach301/youtube-ai-factory";

export function normalizeRepositoryIdentity(value) {
  const raw = String(value ?? "").trim().replace(/\/$/, "");
  if (!raw) return "UNKNOWN";

  const scp = raw.match(/^[^@\s]+@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (scp) return `${scp[1]}/${scp[2]}`;

  const shorthand = raw.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (shorthand) return `${shorthand[1]}/${shorthand[2]}`;

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === "github.com") {
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "").split("/");
      if (parts.length === 2) return `${parts[0]}/${parts[1]}`;
    }
  } catch {
    // The caller will fail closed on an unrecognized identity.
  }

  return raw;
}

export function assertRepositoryIdentities(identities) {
  const observed = [...new Set(identities.map(normalizeRepositoryIdentity))];
  const valid = observed.length === 1 && observed[0] === EXPECTED_REPOSITORY;
  if (!valid) {
    throw new Error(
      `REPOSITORY_IDENTITY_BLOCKED: expected only ${EXPECTED_REPOSITORY}; observed ${observed.join(", ") || "UNKNOWN"}. No edit, commit, merge, checkpoint, deploy, migration or provider dispatch is authorized.`,
    );
  }
  return EXPECTED_REPOSITORY;
}

export function resolveRepositoryIdentities(env = process.env, run = execFileSync) {
  if (env.GITHUB_REPOSITORY) {
    return [normalizeRepositoryIdentity(env.GITHUB_REPOSITORY)];
  }

  let remotes;
  try {
    remotes = String(run("git", ["remote"], { encoding: "utf8" }))
      .split(/\r?\n/)
      .map((remote) => remote.trim())
      .filter(Boolean);
  } catch {
    return ["UNKNOWN"];
  }

  const identities = [];
  for (const remote of remotes) {
    try {
      const urls = String(run("git", ["remote", "get-url", "--all", remote], { encoding: "utf8" }))
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean);
      identities.push(...urls.map(normalizeRepositoryIdentity));
    } catch {
      identities.push("UNKNOWN");
    }
  }
  return identities.length ? identities : ["UNKNOWN"];
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  try {
    const identity = assertRepositoryIdentities(resolveRepositoryIdentities());
    process.stdout.write(`REPOSITORY_IDENTITY_OK: ${identity}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
