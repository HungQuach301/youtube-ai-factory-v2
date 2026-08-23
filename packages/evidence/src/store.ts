import type { Hex64, Namespace, R2Key } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'
import { streamHash } from '@youtube-ai-factory/core-hash'

import { decodeGzipJson, encodeGzipJson } from './codec.js'
import { EvidenceError } from './errors.js'
import type {
  EvidenceClass,
  EvidenceMetadataInput,
  EvidenceObjectStore,
  EvidenceRecord,
  EvidenceReference,
  EvidenceRegistry,
  HtmlTextExtractor,
  ProviderCallSnapshot,
  ProviderCallSnapshotReference,
  RetentionPolicy,
  SnapshotProviderCallInput,
  SnapshotSourceInput,
  SourceSnapshot,
  SourceSnapshotReference,
} from './types.js'

const NAMESPACE_PREFIX: Readonly<Record<Namespace, string>> = {
  production: 'prod',
  qualification: 'qual',
  staging: 'stg',
  quarantine: 'quar',
}

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/u
const SECRET_KEYS = new Set([
  'authorization', 'apikey', 'accesstoken', 'refreshtoken',
  'cookie', 'setcookie', 'clientsecret', 'password',
])

function retentionFor(evidenceClass: EvidenceClass): RetentionPolicy {
  return evidenceClass === 'PROVIDER_REQUEST' || evidenceClass === 'PROVIDER_RESPONSE'
    ? { mode: 'MINIMUM_MONTHS', months: thresholds.EVIDENCE.PROVIDER_RETENTION_MONTHS }
    : { mode: 'PERMANENT', months: null }
}

function validateCreatedAt(value: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new EvidenceError('INVALID_EVIDENCE_METADATA', 'createdAt must be a valid timestamp.')
  }
}

function validateRelativePath(path: string): void {
  const segments = path.split('/')
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')
    || segments.length === 0
    || segments.some((segment) => segment.length === 0
      || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment))) {
    throw new EvidenceError('INVALID_R2_PATH', `Unsafe R2 path: ${path}`)
  }
}

function r2Key(namespace: Namespace, path: string): R2Key {
  validateRelativePath(path)
  return `${NAMESPACE_PREFIX[namespace]}/${path}` as R2Key
}

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[-_.]/gu, '')
}

function assertNoSecretMaterial(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretMaterial(item, seen)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEYS.has(normalizeSensitiveKey(key))) {
      throw new EvidenceError(
        'SECRET_MATERIAL_REJECTED',
        `Secret-bearing field ${key} cannot be written to evidence storage.`,
      )
    }
    assertNoSecretMaterial(child, seen)
  }
}

function assertSafeSourceUrl(value: string): void {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new EvidenceError('INVALID_EVIDENCE_METADATA', 'Source URL is invalid.')
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username.length > 0 || parsed.password.length > 0) {
    throw new EvidenceError('SECRET_MATERIAL_REJECTED', 'Source URL must be HTTP(S) without credentials.')
  }
  parsed.searchParams.forEach((_value, key) => {
    if (SECRET_KEYS.has(normalizeSensitiveKey(key)) || normalizeSensitiveKey(key).includes('signature')) {
      throw new EvidenceError('SECRET_MATERIAL_REJECTED', 'Signed or credential-bearing source URL cannot be persisted.')
    }
  })
}

export class EvidenceStore {
  constructor(
    private readonly objects: EvidenceObjectStore,
    private readonly registry: EvidenceRegistry,
    private readonly extractText: HtmlTextExtractor,
  ) {}

  async putEvidence(
    namespace: Namespace,
    path: string,
    bytes: Uint8Array,
    metadata: EvidenceMetadataInput,
  ): Promise<EvidenceReference> {
    validateCreatedAt(metadata.createdAt)
    if (metadata.contentType.trim().length === 0) {
      throw new EvidenceError('INVALID_EVIDENCE_METADATA', 'contentType is required.')
    }
    const key = r2Key(namespace, path)
    const immutableBytes = bytes.slice()
    const sha256 = await streamHash([immutableBytes])
    const record: EvidenceRecord = {
      ...metadata,
      namespace,
      r2Key: key,
      sha256,
      byteLength: immutableBytes.byteLength,
      retention: retentionFor(metadata.evidenceClass),
      attributes: { ...metadata.attributes },
    }
    await this.objects.putImmutable(key, immutableBytes, {
      sha256,
      contentType: metadata.contentType,
      evidenceClass: metadata.evidenceClass,
      sensitivity: metadata.sensitivity,
    })
    await this.registry.register(record)
    return { r2Key: key, sha256 }
  }

  async getEvidence(key: R2Key): Promise<Uint8Array> {
    const record = await this.registry.find(key)
    const prefix = record === null ? null : `${NAMESPACE_PREFIX[record.namespace]}/`
    if (record === null || prefix === null || !key.startsWith(prefix)) {
      throw new EvidenceError('EVIDENCE_NOT_FOUND', `Evidence registry entry ${key} was not found.`)
    }
    const bytes = await this.objects.get(key)
    if (bytes === null) {
      throw new EvidenceError('EVIDENCE_NOT_FOUND', `Evidence object ${key} was not found.`)
    }
    const actual = await streamHash([bytes])
    if (actual !== record.sha256 || bytes.byteLength !== record.byteLength) {
      throw new EvidenceError('INTEGRITY_MISMATCH', `Evidence object ${key} failed integrity verification.`)
    }
    return bytes.slice()
  }

  async snapshotSource(input: SnapshotSourceInput): Promise<SourceSnapshotReference> {
    assertSafeSourceUrl(input.url)
    validateCreatedAt(input.fetchedAt)
    const fetched = await input.fetcher.fetch(input.url)
    if (fetched.requestedUrl !== input.url || fetched.status < 200 || fetched.status >= 300) {
      throw new EvidenceError(
        'SOURCE_FETCH_FAILED',
        `Source fetch failed closed with HTTP status ${fetched.status}.`,
      )
    }
    assertSafeSourceUrl(fetched.finalUrl)
    const htmlBytes = new TextEncoder().encode(fetched.html)
    const text = this.extractText(fetched.html)
    const textBytes = new TextEncoder().encode(text)
    const contentHash = await streamHash([htmlBytes])
    const basePath = `snapshot/${input.packageId}/sources/${contentHash}`
    const commonAttributes = {
      requested_url: input.url,
      final_url: fetched.finalUrl,
      fetched_at: input.fetchedAt,
    }
    const html = await this.putEvidence(
      input.namespace,
      `${basePath}.html`,
      htmlBytes,
      {
        packageId: input.packageId,
        evidenceClass: 'SOURCE_SNAPSHOT',
        contentType: 'text/html; charset=utf-8',
        sensitivity: 'COPYRIGHT_RESTRICTED',
        createdAt: input.fetchedAt,
        attributes: { ...commonAttributes, representation: 'html' },
      },
    )
    const extracted = await this.putEvidence(
      input.namespace,
      `${basePath}.txt`,
      textBytes,
      {
        packageId: input.packageId,
        evidenceClass: 'SOURCE_SNAPSHOT',
        contentType: 'text/plain; charset=utf-8',
        sensitivity: 'COPYRIGHT_RESTRICTED',
        createdAt: input.fetchedAt,
        attributes: { ...commonAttributes, representation: 'extracted_text' },
      },
    )
    return {
      namespace: input.namespace,
      packageId: input.packageId,
      requestedUrl: input.url,
      finalUrl: fetched.finalUrl,
      fetchedAt: input.fetchedAt,
      contentHash,
      htmlR2Key: html.r2Key,
      textR2Key: extracted.r2Key,
    }
  }

  async getSourceSnapshot(reference: SourceSnapshotReference): Promise<SourceSnapshot> {
    const htmlBytes = await this.getEvidence(reference.htmlR2Key)
    const textBytes = await this.getEvidence(reference.textR2Key)
    const actualContentHash = await streamHash([htmlBytes])
    if (actualContentHash !== reference.contentHash) {
      throw new EvidenceError('INTEGRITY_MISMATCH', 'Source snapshot content hash does not match its reference.')
    }
    const decoder = new TextDecoder('utf-8', { fatal: true })
    return {
      ...reference,
      html: decoder.decode(htmlBytes),
      text: decoder.decode(textBytes),
    }
  }

  async snapshotProviderCall(
    input: SnapshotProviderCallInput,
  ): Promise<ProviderCallSnapshotReference> {
    validateCreatedAt(input.createdAt)
    assertNoSecretMaterial(input.request)
    assertNoSecretMaterial(input.response)
    const requestBytes = await encodeGzipJson(input.request)
    const responseBytes = await encodeGzipJson(input.response)
    const basePath = `evidence/${input.packageId}/${input.traceId}/${input.spanId}`
    const attributes = { trace_id: input.traceId, span_id: input.spanId, encoding: 'gzip' }
    const request = await this.putEvidence(
      input.namespace,
      `${basePath}/request.json.gz`,
      requestBytes,
      {
        packageId: input.packageId,
        evidenceClass: 'PROVIDER_REQUEST',
        contentType: 'application/json',
        sensitivity: 'PROVIDER_CONFIDENTIAL',
        createdAt: input.createdAt,
        attributes,
      },
    )
    const response = await this.putEvidence(
      input.namespace,
      `${basePath}/response.json.gz`,
      responseBytes,
      {
        packageId: input.packageId,
        evidenceClass: 'PROVIDER_RESPONSE',
        contentType: 'application/json',
        sensitivity: 'PROVIDER_CONFIDENTIAL',
        createdAt: input.createdAt,
        attributes,
      },
    )
    return {
      namespace: input.namespace,
      packageId: input.packageId,
      traceId: input.traceId,
      spanId: input.spanId,
      requestR2Key: request.r2Key,
      requestSha256: request.sha256,
      responseR2Key: response.r2Key,
      responseSha256: response.sha256,
    }
  }

  async getProviderCallSnapshot(
    reference: ProviderCallSnapshotReference,
  ): Promise<ProviderCallSnapshot> {
    const requestBytes = await this.getEvidence(reference.requestR2Key)
    const responseBytes = await this.getEvidence(reference.responseR2Key)
    const [requestHash, responseHash] = await Promise.all([
      streamHash([requestBytes]), streamHash([responseBytes]),
    ])
    if (requestHash !== reference.requestSha256 || responseHash !== reference.responseSha256) {
      throw new EvidenceError('INTEGRITY_MISMATCH', 'Provider snapshot pair hash does not match its reference.')
    }
    const [request, response] = await Promise.all([
      decodeGzipJson(requestBytes), decodeGzipJson(responseBytes),
    ])
    return { request, response }
  }
}
