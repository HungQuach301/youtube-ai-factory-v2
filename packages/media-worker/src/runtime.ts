import type { Hex64, R2Key } from '@youtube-ai-factory/contracts'
import { streamHash } from '@youtube-ai-factory/core-hash'

import {
  MediaJobEnvelopeSchema,
  MediaWorkerError,
} from './types.js'
import type {
  ExecutedArtifact,
  MediaJobEnvelope,
  MediaWorkerCompletion,
  MediaWorkerPorts,
  ResolvedMediaInput,
  StoredWorkerArtifact,
} from './types.js'

async function hashBytes(bytes: Uint8Array): Promise<Hex64> {
  return streamHash([bytes])
}

function assertDeadline(envelope: MediaJobEnvelope, ports: MediaWorkerPorts): void {
  if (ports.clock.now().getTime() >= Date.parse(envelope.deadlineAt)) {
    throw new MediaWorkerError('DEADLINE_EXCEEDED', 'Media job deadline has expired.')
  }
}

function outputKey(prefix: string, name: string): R2Key {
  return `${prefix.replace(/\/$/u, '')}/${name}` as R2Key
}

function exactArtifactSet(expected: readonly string[], actual: readonly ExecutedArtifact[]): boolean {
  const actualNames = actual.map((artifact) => artifact.name)
  return new Set(actualNames).size === actualNames.length
    && expected.length === actualNames.length
    && expected.every((name) => actualNames.includes(name))
}

export class MediaWorkerRuntime {
  constructor(private readonly ports: MediaWorkerPorts) {}

  async consume(message: unknown): Promise<MediaWorkerCompletion> {
    const parsed = MediaJobEnvelopeSchema.safeParse(message)
    if (!parsed.success) {
      throw new MediaWorkerError('INVALID_ENVELOPE', parsed.error.message)
    }
    const envelope = parsed.data
    if (envelope.imageDigest !== this.ports.imageDigest) {
      throw new MediaWorkerError('IMAGE_DIGEST_MISMATCH', 'Envelope image digest does not match the running worker image.')
    }
    assertDeadline(envelope, this.ports)
    const startedAt = this.ports.clock.monotonicMs()
    const inputs = await this.loadInputs(envelope)
    assertDeadline(envelope, this.ports)
    const executed = await this.ports.executor.execute(envelope.spec, inputs, envelope.deadlineAt)
    assertDeadline(envelope, this.ports)
    if (!exactArtifactSet(envelope.outputs.expectedArtifacts, executed)) {
      throw new MediaWorkerError('OUTPUT_SET_MISMATCH', 'Executor output does not match expected artifacts.')
    }
    const artifacts = await this.storeAndVerify(envelope, executed)
    assertDeadline(envelope, this.ports)
    const completion: MediaWorkerCompletion = {
      type: 'PRODUCE_ARTIFACT',
      traceId: envelope.traceId,
      packageId: envelope.packageId,
      stageInstanceId: envelope.stageInstanceId,
      fencingToken: envelope.fencingToken,
      reservationId: envelope.reservationId,
      imageDigest: envelope.imageDigest,
      artifacts,
      resources: {
        elapsedMs: Math.max(0, this.ports.clock.monotonicMs() - startedAt),
        inputBytes: inputs.reduce((sum, input) => sum + input.bytes.byteLength, 0),
        outputBytes: artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0),
      },
    }
    await this.ports.completionPublisher.publish(completion)
    return completion
  }

  private async loadInputs(envelope: MediaJobEnvelope): Promise<readonly ResolvedMediaInput[]> {
    const resolved: ResolvedMediaInput[] = []
    for (const [index, input] of envelope.inputs.entries()) {
      const key = input.r2Key as R2Key
      const bytes = await this.ports.objectStore.get(key)
      if (bytes === null) throw new MediaWorkerError('INPUT_MISSING', `Input ${index} is missing.`)
      const actualHash = await hashBytes(bytes)
      if (actualHash !== input.sha256) {
        throw new MediaWorkerError('INPUT_INTEGRITY_MISMATCH', `Input ${index} failed SHA-256 verification.`)
      }
      resolved.push({ index, r2Key: key, sha256: actualHash, bytes })
    }
    return resolved
  }

  private async storeAndVerify(
    envelope: MediaJobEnvelope,
    executed: readonly ExecutedArtifact[],
  ): Promise<readonly StoredWorkerArtifact[]> {
    const stored: StoredWorkerArtifact[] = []
    for (const artifact of executed) {
      const key = outputKey(envelope.outputs.r2Prefix, artifact.name)
      const expectedHash = await hashBytes(artifact.bytes)
      await this.ports.objectStore.putImmutable(key, artifact.bytes)
      const readBack = await this.ports.objectStore.get(key)
      if (readBack === null) throw new MediaWorkerError('OUTPUT_READBACK_MISSING', `Output ${artifact.name} could not be read back.`)
      const actualHash = await hashBytes(readBack)
      if (expectedHash !== actualHash) {
        throw new MediaWorkerError('OUTPUT_INTEGRITY_MISMATCH', `Output ${artifact.name} failed read-back verification.`)
      }
      stored.push({
        name: artifact.name,
        r2Key: key,
        sha256: actualHash,
        byteLength: readBack.byteLength,
        ...(artifact.frameMd5 === undefined ? {} : { frameMd5: artifact.frameMd5 }),
      })
    }
    return stored
  }
}
