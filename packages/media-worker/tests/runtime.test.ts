import { describe, expect, it } from 'vitest'

import type { Hex64, R2Key } from '@youtube-ai-factory/contracts'
import { streamHash } from '@youtube-ai-factory/core-hash'

import { buildToolInvocation, MediaWorkerRuntime } from '../src/index.js'
import type {
  ExecutedArtifact,
  MediaJobEnvelope,
  MediaWorkerCompletion,
  MediaWorkerPorts,
  WorkerObjectStore,
} from '../src/index.js'

const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`
const INPUT_BYTES = new TextEncoder().encode('deterministic media input')
const OUTPUT_BYTES = new TextEncoder().encode('deterministic media output')

async function hex(bytes: Uint8Array): Promise<string> {
  return streamHash([bytes])
}

class MemoryStore implements WorkerObjectStore {
  readonly values = new Map<string, Uint8Array>()
  corruptReadBack = false
  writes = 0

  async get(key: R2Key): Promise<Uint8Array | null> {
    const value = this.values.get(key)
    if (value === undefined) return null
    return this.corruptReadBack && key.startsWith('prod/output/')
      ? new TextEncoder().encode('corrupt')
      : value.slice()
  }

  async putImmutable(key: R2Key, bytes: Uint8Array): Promise<void> {
    if (this.values.has(key)) throw new Error('fixture overwrite')
    this.writes += 1
    this.values.set(key, bytes.slice())
  }
}

async function envelope(overrides: Partial<MediaJobEnvelope> = {}): Promise<MediaJobEnvelope> {
  return {
    traceId: 'trace-12',
    packageId: 'package-12',
    stageInstanceId: 'stage-12',
    fencingToken: 12,
    capabilityId: 'media-worker@1.0.0',
    settingsHash: 'b'.repeat(64),
    reservationId: 'reservation-12',
    namespace: 'qualification',
    imageDigest: IMAGE_DIGEST,
    profile: 'REDUCED',
    inputs: [{ r2Key: 'qual/input/source.bin', sha256: await hex(INPUT_BYTES) }],
    spec: { operation: 'PROBE', artifactName: 'probe.json', input: 0 },
    outputs: { r2Prefix: 'prod/output', expectedArtifacts: ['probe.json'] },
    deadlineAt: '2030-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function fixture(options: { readonly output?: readonly ExecutedArtifact[] } = {}) {
  const store = new MemoryStore()
  store.values.set('qual/input/source.bin', INPUT_BYTES)
  const published: MediaWorkerCompletion[] = []
  let executions = 0
  let monotonic = 100
  const ports: MediaWorkerPorts = {
    imageDigest: IMAGE_DIGEST,
    objectStore: store,
    clock: { now: () => new Date('2026-08-23T00:00:00.000Z'), monotonicMs: () => ++monotonic },
    executor: {
      async execute() {
        executions += 1
        return options.output ?? [{ name: 'probe.json', bytes: OUTPUT_BYTES, frameMd5: 'frame-md5' }]
      },
    },
    completionPublisher: { async publish(value) { published.push(value) } },
  }
  return { store, ports, published, executions: () => executions }
}

describe('MediaWorkerRuntime', () => {
  it('produces identical hashes on five isolated stateless workers', async () => {
    const job = await envelope()
    const results = await Promise.all(Array.from({ length: 5 }, async () => {
      const item = await fixture()
      return new MediaWorkerRuntime(item.ports).consume(job)
    }))
    expect(new Set(results.map((result) => result.artifacts[0]?.sha256))).toEqual(new Set([await hex(OUTPUT_BYTES)]))
    expect(results.every((result) => result.artifacts[0]?.frameMd5 === 'frame-md5')).toBe(true)
  })

  it('validates the envelope before any object or executor side effect', async () => {
    const item = await fixture()
    await expect(new MediaWorkerRuntime(item.ports).consume({ packageId: 'partial' })).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' })
    expect(item.executions()).toBe(0)
    expect(item.store.writes).toBe(0)
    expect(item.published).toHaveLength(0)
  })

  it('rejects an image digest mismatch before reading or executing', async () => {
    const item = await fixture()
    await expect(new MediaWorkerRuntime(item.ports).consume(await envelope({ imageDigest: `sha256:${'c'.repeat(64)}` }))).rejects.toMatchObject({ code: 'IMAGE_DIGEST_MISMATCH' })
    expect(item.executions()).toBe(0)
    expect(item.store.writes).toBe(0)
  })

  it('rejects expired jobs with zero side effect', async () => {
    const item = await fixture()
    await expect(new MediaWorkerRuntime(item.ports).consume(await envelope({ deadlineAt: '2020-01-01T00:00:00.000Z' }))).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' })
    expect(item.executions()).toBe(0)
    expect(item.store.writes).toBe(0)
  })

  it('verifies every input checksum before invoking media tools', async () => {
    const item = await fixture()
    const job = await envelope({ inputs: [{ r2Key: 'qual/input/source.bin', sha256: 'd'.repeat(64) as Hex64 }] })
    await expect(new MediaWorkerRuntime(item.ports).consume(job)).rejects.toMatchObject({ code: 'INPUT_INTEGRITY_MISMATCH' })
    expect(item.executions()).toBe(0)
    expect(item.store.writes).toBe(0)
  })

  it('requires the executor output set to equal the declared artifact set', async () => {
    const item = await fixture({ output: [{ name: 'unexpected.json', bytes: OUTPUT_BYTES }] })
    await expect(new MediaWorkerRuntime(item.ports).consume(await envelope())).rejects.toMatchObject({ code: 'OUTPUT_SET_MISMATCH' })
    expect(item.store.writes).toBe(0)
    expect(item.published).toHaveLength(0)
  })

  it('publishes only after immutable write and read-back checksum verification', async () => {
    const item = await fixture()
    item.store.corruptReadBack = true
    await expect(new MediaWorkerRuntime(item.ports).consume(await envelope())).rejects.toMatchObject({ code: 'OUTPUT_INTEGRITY_MISMATCH' })
    expect(item.published).toHaveLength(0)
  })

  it('emits a completion command with resource accounting after verified read-back', async () => {
    const item = await fixture()
    const result = await new MediaWorkerRuntime(item.ports).consume(await envelope())
    expect(item.published).toEqual([result])
    expect(result).toMatchObject({
      type: 'PRODUCE_ARTIFACT',
      packageId: 'package-12',
      reservationId: 'reservation-12',
      resources: { inputBytes: INPUT_BYTES.byteLength, outputBytes: OUTPUT_BYTES.byteLength },
    })
  })
})

describe('media tool plans', () => {
  it.each([
    [{ operation: 'COMPOSITE', artifactName: 'out.mkv', primaryInput: 0, secondaryInput: 1, layout: 'OVERLAY' }, 'ffmpeg'],
    [{ operation: 'ENCODE', artifactName: 'out.mkv', input: 0, codec: 'FFV1' }, 'ffmpeg'],
    [{ operation: 'ALIGN', artifactName: 'align.json', audioInput: 0, transcriptInput: 1, engine: 'MFA' }, 'mfa'],
    [{ operation: 'PROBE', artifactName: 'probe.json', input: 0 }, 'ffprobe'],
    [{ operation: 'FLOW', artifactName: 'flow.json', input: 0 }, 'factory-flow'],
    [{ operation: 'PHASH', artifactName: 'phash.json', input: 0 }, 'factory-phash'],
  ] as const)('builds a deterministic %s invocation', (spec, executable) => {
    const first = buildToolInvocation(spec)
    const second = buildToolInvocation(spec)
    expect(first).toEqual(second)
    expect(first.executable).toBe(executable)
  })
})
