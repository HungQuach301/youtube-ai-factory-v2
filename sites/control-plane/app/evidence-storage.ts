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
  if (!key.startsWith("qual/") || key.includes("..") || key.includes("\\")) {
    throw new Error("VOICE_EVIDENCE_R2_KEY_INVALID");
  }
  if (sha256(bytes) !== expectedSha256) throw new Error("VOICE_EVIDENCE_HASH_MISMATCH");
  const store = bucket();
  const existing = await store.get(key);
  if (existing) {
    const existingBytes = new Uint8Array(await existing.arrayBuffer());
    if (sha256(existingBytes) !== expectedSha256) throw new Error("VOICE_EVIDENCE_IMMUTABILITY_CONFLICT");
    return;
  }
  await store.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sha256: expectedSha256, namespace: "qualification" },
  });
  const readBack = await store.get(key);
  if (!readBack) throw new Error("VOICE_EVIDENCE_R2_READ_BACK_MISSING");
  const readBackBytes = new Uint8Array(await readBack.arrayBuffer());
  if (sha256(readBackBytes) !== expectedSha256) throw new Error("VOICE_EVIDENCE_R2_READ_BACK_MISMATCH");
}

export async function verifyImmutableEvidence(key: string, expectedSha256: string): Promise<boolean> {
  const object = await bucket().get(key);
  if (!object) return false;
  return sha256(new Uint8Array(await object.arrayBuffer())) === expectedSha256;
}
