import { createHash } from "node:crypto";
import { getFactoryEnv } from "./runtime-env";

function bucket(): R2Bucket {
  const binding = getFactoryEnv().BUCKET;
  if (!binding) throw new Error("FACTORY_R2_UNAVAILABLE");
  return binding;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function putImmutableEvidence(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  expectedSha256: string,
): Promise<void> {
  return putImmutableObject("qualification", "qual/", key, bytes, contentType, expectedSha256);
}

export async function putImmutableProductionEvidence(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  expectedSha256: string,
): Promise<void> {
  return putImmutableObject("production", "prod/", key, bytes, contentType, expectedSha256);
}

async function putImmutableObject(
  namespace: "qualification" | "production",
  prefix: "qual/" | "prod/",
  key: string,
  bytes: Uint8Array,
  contentType: string,
  expectedSha256: string,
): Promise<void> {
  if (!key.startsWith(prefix) || key.includes("..") || key.includes("\\")) {
    throw new Error(`${namespace.toUpperCase()}_EVIDENCE_R2_KEY_INVALID`);
  }
  if (sha256(bytes) !== expectedSha256) throw new Error(`${namespace.toUpperCase()}_EVIDENCE_HASH_MISMATCH`);
  const store = bucket();
  const existing = await store.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (sha256(existingBytes) !== expectedSha256) throw new Error(`${namespace.toUpperCase()}_EVIDENCE_IMMUTABILITY_CONFLICT`);
    return;
  }
  await store.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sha256: expectedSha256, namespace },
  });
  const readBack = await store.get(key);
  if (!readBack) throw new Error(`${namespace.toUpperCase()}_EVIDENCE_R2_READ_BACK_MISSING`);
  const readBackBytes = new Uint8Array(await readBack.arrayBuffer());
  if (sha256(readBackBytes) !== expectedSha256) throw new Error(`${namespace.toUpperCase()}_EVIDENCE_R2_READ_BACK_MISMATCH`);
}

export async function verifyImmutableEvidence(key: string, expectedSha256: string): Promise<boolean> {
  const object = await bucket().get(key);
  if (!object) return false;
  return sha256(new Uint8Array(await object.arrayBuffer())) === expectedSha256;
}

export async function readVerifiedProductionEvidence(
  key: string,
  expectedSha256: string,
): Promise<Uint8Array> {
  if (!key.startsWith("prod/") || key.includes("..") || key.includes("\\")) {
    throw new Error("PRODUCTION_EVIDENCE_R2_KEY_INVALID");
  }
  const object = await bucket().get(key);
  if (!object) throw new Error("PRODUCTION_EVIDENCE_R2_READ_BACK_MISSING");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (sha256(bytes) !== expectedSha256) {
    throw new Error("PRODUCTION_EVIDENCE_R2_READ_BACK_MISMATCH");
  }
  return bytes;
}
