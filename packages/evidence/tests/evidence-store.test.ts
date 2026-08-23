import { describe, expect, it } from 'vitest'

import type { Hex64, PackageId, R2Key, TraceId } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import type {
  EvidenceObjectMetadata,
  EvidenceObjectStore,
  SourceFetcher,
} from '../src/index.js'
import {
  EvidenceStore,
  InMemoryEvidenceObjectStore,
  InMemoryEvidenceRegistry,
} from '../src/index.js'

const PACKAGE_ID = 'package-1' as PackageId
const TRACE_ID = 'trace-1' as TraceId

function extractor(html: string): string {
  return html.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function createStore() {
  const objects = new InMemoryEvidenceObjectStore()
  const registry = new InMemoryEvidenceRegistry()
  return { objects, registry, evidence: new EvidenceStore(objects, registry, extractor) }
}

describe('source snapshots', () => {
  it('reconstructs source evidence after the live URL disappears', async () => {
    let online = true
    const fetcher: SourceFetcher = {
      async fetch(url) {
        if (!online) throw new Error('404 deleted')
        return {
          requestedUrl: url,
          finalUrl: `${url}?canonical=1`,
          status: 200,
          html: '<html><body><h1>Evidence survives</h1><p>Original source.</p></body></html>',
        }
      },
    }
    const { evidence } = createStore()
    const reference = await evidence.snapshotSource({
      namespace: 'production', packageId: PACKAGE_ID,
      url: 'https://source.example/report', fetchedAt: '2026-08-23T00:00:00Z', fetcher,
    })

    online = false
    await expect(fetcher.fetch('https://source.example/report')).rejects.toThrow(/deleted/iu)
    await expect(evidence.getSourceSnapshot(reference)).resolves.toMatchObject({
      html: expect.stringContaining('Evidence survives'),
      text: 'Evidence survives Original source.',
      requestedUrl: 'https://source.example/report',
      finalUrl: 'https://source.example/report?canonical=1',
    })
    expect(reference.htmlR2Key).toMatch(/^prod\/snapshot\/package-1\/sources\/[a-f0-9]{64}\.html$/u)
    expect(reference.textR2Key).toMatch(/^prod\/snapshot\/package-1\/sources\/[a-f0-9]{64}\.txt$/u)
    expect(reference.contentHash).toHaveLength(64)
  })

  it('rejects non-success HTTP responses instead of snapshotting an error page', async () => {
    const { evidence, objects } = createStore()
    const fetcher: SourceFetcher = {
      fetch: async (url) => ({ requestedUrl: url, finalUrl: url, status: 404, html: 'gone' }),
    }
    await expect(evidence.snapshotSource({
      namespace: 'production', packageId: PACKAGE_ID,
      url: 'https://source.example/gone', fetchedAt: '2026-08-23T00:00:00Z', fetcher,
    })).rejects.toThrowError(expect.objectContaining({ code: 'SOURCE_FETCH_FAILED' }))
    expect(objects.size).toBe(0)
  })
})

describe('provider call snapshots', () => {
  it('stores and replays a complete request/response pair with volatile fields preserved', async () => {
    const { evidence, registry } = createStore()
    const pair = await evidence.snapshotProviderCall({
      namespace: 'qualification', packageId: PACKAGE_ID, traceId: TRACE_ID, spanId: 'span-1',
      createdAt: '2026-08-23T00:00:00Z',
      request: { model: 'model-snapshot-1', request_id: 'request-123', timestamp: '2026-08-23' },
      response: { output: 'result', latency: 42, usage: { input: 10, output: 5 } },
    })

    expect(pair.requestR2Key).toBe('qual/evidence/package-1/trace-1/span-1/request.json.gz')
    expect(pair.responseR2Key).toBe('qual/evidence/package-1/trace-1/span-1/response.json.gz')
    await expect(evidence.getProviderCallSnapshot(pair)).resolves.toEqual({
      request: { model: 'model-snapshot-1', request_id: 'request-123', timestamp: '2026-08-23' },
      response: { latency: 42, output: 'result', usage: { input: 10, output: 5 } },
    })

    const requestRecord = await registry.find(pair.requestR2Key)
    const responseRecord = await registry.find(pair.responseR2Key)
    expect(requestRecord?.retention).toEqual({
      mode: 'MINIMUM_MONTHS', months: thresholds.EVIDENCE.PROVIDER_RETENTION_MONTHS,
    })
    expect(responseRecord?.retention).toEqual(requestRecord?.retention)
  })

  it('rejects credentials before any request or response bytes are written', async () => {
    const { evidence, objects } = createStore()
    await expect(evidence.snapshotProviderCall({
      namespace: 'staging', packageId: PACKAGE_ID, traceId: TRACE_ID, spanId: 'span-secret',
      createdAt: '2026-08-23T00:00:00Z',
      request: { headers: { Authorization: 'Bearer must-not-persist' }, prompt: 'safe' },
      response: { output: 'unused' },
    })).rejects.toThrowError(expect.objectContaining({ code: 'SECRET_MATERIAL_REJECTED' }))
    expect(objects.size).toBe(0)
  })

  it('is idempotent for the same pair and rejects reuse of trace/span for different bytes', async () => {
    const { evidence, objects } = createStore()
    const input = {
      namespace: 'staging' as const, packageId: PACKAGE_ID, traceId: TRACE_ID, spanId: 'span-idempotent',
      createdAt: '2026-08-23T00:00:00Z', request: { prompt: 'one' }, response: { output: 'one' },
    }
    await evidence.snapshotProviderCall(input)
    await evidence.snapshotProviderCall(input)
    expect(objects.size).toBe(2)

    await expect(evidence.snapshotProviderCall({ ...input, request: { prompt: 'different' } }))
      .rejects.toThrowError(expect.objectContaining({ code: 'IMMUTABILITY_VIOLATION' }))
  })
})

describe('generic evidence integrity and namespace isolation', () => {
  it.each([
    ['production', 'prod'], ['qualification', 'qual'], ['staging', 'stg'], ['quarantine', 'quar'],
  ] as const)('maps %s to the isolated %s R2 prefix', async (namespace, prefix) => {
    const { evidence } = createStore()
    const result = await evidence.putEvidence(
      namespace,
      'evidence/package-1/result.bin',
      new TextEncoder().encode(namespace),
      {
        packageId: PACKAGE_ID, evidenceClass: 'MEASUREMENT_OUTPUT',
        contentType: 'application/octet-stream', sensitivity: 'INTERNAL',
        createdAt: '2026-08-23T00:00:00Z',
      },
    )
    expect(result.r2Key).toBe(`${prefix}/evidence/package-1/result.bin`)
  })

  it('rejects traversal and absolute paths', async () => {
    const { evidence } = createStore()
    for (const path of ['../secret', '/evidence/file', 'evidence/../secret', 'evidence\\secret']) {
      await expect(evidence.putEvidence(
        'production', path, new Uint8Array([1]),
        {
          packageId: PACKAGE_ID, evidenceClass: 'MEASUREMENT_OUTPUT',
          contentType: 'application/octet-stream', sensitivity: 'INTERNAL',
          createdAt: '2026-08-23T00:00:00Z',
        },
      )).rejects.toThrowError(expect.objectContaining({ code: 'INVALID_R2_PATH' }))
    }
  })

  it('detects bytes changed behind the immutable registry', async () => {
    class CorruptibleStore implements EvidenceObjectStore {
      bytes = new Map<string, Uint8Array>()
      async putImmutable(key: R2Key, value: Uint8Array, _meta: EvidenceObjectMetadata) {
        this.bytes.set(key, value.slice())
      }
      async get(key: R2Key) { return this.bytes.get(key)?.slice() ?? null }
    }
    const objects = new CorruptibleStore()
    const evidence = new EvidenceStore(objects, new InMemoryEvidenceRegistry(), extractor)
    const saved = await evidence.putEvidence(
      'production', 'evidence/package-1/measurement.json', new TextEncoder().encode('{"score":94}'),
      {
        packageId: PACKAGE_ID, evidenceClass: 'MEASUREMENT_OUTPUT',
        contentType: 'application/json', sensitivity: 'INTERNAL',
        createdAt: '2026-08-23T00:00:00Z',
      },
    )
    objects.bytes.set(saved.r2Key, new TextEncoder().encode('{"score":0}'))
    await expect(evidence.getEvidence(saved.r2Key))
      .rejects.toThrowError(expect.objectContaining({ code: 'INTEGRITY_MISMATCH' }))
  })

  it('fails closed when the registry or object is missing', async () => {
    const { evidence } = createStore()
    await expect(evidence.getEvidence('prod/evidence/missing' as R2Key))
      .rejects.toThrowError(expect.objectContaining({ code: 'EVIDENCE_NOT_FOUND' }))
  })
})

it('uses branded hashes without weakening the public result contract', async () => {
  const { evidence } = createStore()
  const result = await evidence.putEvidence(
    'quarantine', 'evidence/package-1/rejected.bin', new Uint8Array([1, 2, 3]),
    {
      packageId: PACKAGE_ID, evidenceClass: 'REJECTED_CANDIDATE',
      contentType: 'application/octet-stream', sensitivity: 'INTERNAL',
      createdAt: '2026-08-23T00:00:00Z',
    },
  )
  const hash: Hex64 = result.sha256
  expect(hash).toMatch(/^[a-f0-9]{64}$/u)
})
