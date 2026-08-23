import type {
  Hex64,
  Namespace,
  PackageId,
  R2Key,
  TraceId,
} from '@youtube-ai-factory/contracts'

export type EvidenceClass =
  | 'SOURCE_SNAPSHOT'
  | 'PROVIDER_REQUEST'
  | 'PROVIDER_RESPONSE'
  | 'MEASUREMENT_OUTPUT'
  | 'REJECTED_CANDIDATE'

export type EvidenceSensitivity =
  | 'COPYRIGHT_RESTRICTED'
  | 'PROVIDER_CONFIDENTIAL'
  | 'INTERNAL'

export type RetentionPolicy =
  | { readonly mode: 'PERMANENT', readonly months: null }
  | { readonly mode: 'MINIMUM_MONTHS', readonly months: number }

export interface EvidenceMetadataInput {
  readonly packageId: PackageId
  readonly evidenceClass: EvidenceClass
  readonly contentType: string
  readonly sensitivity: EvidenceSensitivity
  readonly createdAt: string
  readonly attributes?: Readonly<Record<string, string>>
}

export interface EvidenceObjectMetadata {
  readonly sha256: Hex64
  readonly contentType: string
  readonly evidenceClass: EvidenceClass
  readonly sensitivity: EvidenceSensitivity
}

export interface EvidenceRecord extends EvidenceMetadataInput {
  readonly namespace: Namespace
  readonly r2Key: R2Key
  readonly sha256: Hex64
  readonly byteLength: number
  readonly retention: RetentionPolicy
  readonly attributes: Readonly<Record<string, string>>
}

export interface EvidenceReference {
  readonly r2Key: R2Key
  readonly sha256: Hex64
}

export interface EvidenceObjectStore {
  putImmutable(
    key: R2Key,
    bytes: Uint8Array,
    metadata: EvidenceObjectMetadata,
  ): Promise<void>
  get(key: R2Key): Promise<Uint8Array | null>
}

export interface EvidenceRegistry {
  register(record: EvidenceRecord): Promise<void>
  find(key: R2Key): Promise<EvidenceRecord | null>
}

export interface SourceFetchResult {
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly status: number
  readonly html: string
}

export interface SourceFetcher {
  fetch(url: string): Promise<SourceFetchResult>
}

export type HtmlTextExtractor = (html: string) => string

export interface SnapshotSourceInput {
  readonly namespace: Namespace
  readonly packageId: PackageId
  readonly url: string
  readonly fetchedAt: string
  readonly fetcher: SourceFetcher
}

export interface SourceSnapshotReference {
  readonly namespace: Namespace
  readonly packageId: PackageId
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly fetchedAt: string
  readonly contentHash: Hex64
  readonly htmlR2Key: R2Key
  readonly textR2Key: R2Key
}

export interface SourceSnapshot extends SourceSnapshotReference {
  readonly html: string
  readonly text: string
}

export interface SnapshotProviderCallInput {
  readonly namespace: Namespace
  readonly packageId: PackageId
  readonly traceId: TraceId
  readonly spanId: string
  readonly createdAt: string
  readonly request: unknown
  readonly response: unknown
}

export interface ProviderCallSnapshotReference {
  readonly namespace: Namespace
  readonly packageId: PackageId
  readonly traceId: TraceId
  readonly spanId: string
  readonly requestR2Key: R2Key
  readonly requestSha256: Hex64
  readonly responseR2Key: R2Key
  readonly responseSha256: Hex64
}

export interface ProviderCallSnapshot {
  readonly request: unknown
  readonly response: unknown
}
