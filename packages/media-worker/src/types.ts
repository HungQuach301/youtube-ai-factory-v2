import { z } from 'zod'

import { JobEnvelopeSchema } from '@youtube-ai-factory/contracts'
import type { Hex64, R2Key } from '@youtube-ai-factory/contracts'

const ArtifactNameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/u)
const InputIndexSchema = z.number().int().nonnegative()

export const MediaJobSpecSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('COMPOSITE'),
    artifactName: ArtifactNameSchema,
    primaryInput: InputIndexSchema,
    secondaryInput: InputIndexSchema,
    layout: z.enum(['OVERLAY', 'HSTACK', 'VSTACK']),
  }).strict(),
  z.object({
    operation: z.literal('ENCODE'),
    artifactName: ArtifactNameSchema,
    input: InputIndexSchema,
    codec: z.enum(['FFV1', 'H264']),
  }).strict(),
  z.object({
    operation: z.literal('ALIGN'),
    artifactName: ArtifactNameSchema,
    audioInput: InputIndexSchema,
    transcriptInput: InputIndexSchema,
    engine: z.enum(['WHISPERX', 'MFA']),
  }).strict(),
  z.object({
    operation: z.literal('PROBE'),
    artifactName: ArtifactNameSchema,
    input: InputIndexSchema,
  }).strict(),
  z.object({
    operation: z.literal('FLOW'),
    artifactName: ArtifactNameSchema,
    input: InputIndexSchema,
  }).strict(),
  z.object({
    operation: z.literal('PHASH'),
    artifactName: ArtifactNameSchema,
    input: InputIndexSchema,
  }).strict(),
])

export const MediaJobEnvelopeSchema = JobEnvelopeSchema.extend({
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  spec: MediaJobSpecSchema,
}).strict().superRefine((envelope, context) => {
  const uniqueArtifacts = new Set(envelope.outputs.expectedArtifacts)
  if (uniqueArtifacts.size !== envelope.outputs.expectedArtifacts.length) {
    context.addIssue({ code: 'custom', path: ['outputs', 'expectedArtifacts'], message: 'Expected artifacts must be unique.' })
  }
  if (!uniqueArtifacts.has(envelope.spec.artifactName) || uniqueArtifacts.size !== 1) {
    context.addIssue({ code: 'custom', path: ['outputs', 'expectedArtifacts'], message: 'Spec must produce exactly the declared artifact.' })
  }
  if (envelope.outputs.r2Prefix.startsWith('/') || envelope.outputs.r2Prefix.includes('..') || envelope.outputs.r2Prefix.includes('\\')) {
    context.addIssue({ code: 'custom', path: ['outputs', 'r2Prefix'], message: 'Output prefix must remain inside its namespace.' })
  }
})

export type MediaJobSpec = z.infer<typeof MediaJobSpecSchema>
export type MediaJobEnvelope = z.infer<typeof MediaJobEnvelopeSchema>

export interface ResolvedMediaInput {
  readonly index: number
  readonly r2Key: R2Key
  readonly sha256: Hex64
  readonly bytes: Uint8Array
}

export interface ExecutedArtifact {
  readonly name: string
  readonly bytes: Uint8Array
  readonly frameMd5?: string
}

export interface StoredWorkerArtifact {
  readonly name: string
  readonly r2Key: R2Key
  readonly sha256: Hex64
  readonly byteLength: number
  readonly frameMd5?: string
}

export interface WorkerResourceReport {
  readonly elapsedMs: number
  readonly inputBytes: number
  readonly outputBytes: number
}

export interface MediaWorkerCompletion {
  readonly type: 'PRODUCE_ARTIFACT'
  readonly traceId: string
  readonly packageId: string
  readonly stageInstanceId: string
  readonly fencingToken: number
  readonly reservationId: string
  readonly imageDigest: string
  readonly artifacts: readonly StoredWorkerArtifact[]
  readonly resources: WorkerResourceReport
}

export interface WorkerObjectStore {
  get(key: R2Key): Promise<Uint8Array | null>
  putImmutable(key: R2Key, bytes: Uint8Array): Promise<void>
}

export interface MediaExecutor {
  execute(spec: MediaJobSpec, inputs: readonly ResolvedMediaInput[], deadlineAt: string): Promise<readonly ExecutedArtifact[]>
}

export interface CompletionPublisher {
  publish(completion: MediaWorkerCompletion): Promise<void>
}

export interface WorkerClock {
  now(): Date
  monotonicMs(): number
}

export interface MediaWorkerPorts {
  readonly objectStore: WorkerObjectStore
  readonly executor: MediaExecutor
  readonly completionPublisher: CompletionPublisher
  readonly clock: WorkerClock
  readonly imageDigest: string
}

export type MediaWorkerErrorCode =
  | 'INVALID_ENVELOPE'
  | 'IMAGE_DIGEST_MISMATCH'
  | 'DEADLINE_EXCEEDED'
  | 'INPUT_MISSING'
  | 'INPUT_INTEGRITY_MISMATCH'
  | 'OUTPUT_SET_MISMATCH'
  | 'OUTPUT_READBACK_MISSING'
  | 'OUTPUT_INTEGRITY_MISMATCH'

export class MediaWorkerError extends Error {
  constructor(readonly code: MediaWorkerErrorCode, message: string) {
    super(message)
    this.name = 'MediaWorkerError'
  }
}
