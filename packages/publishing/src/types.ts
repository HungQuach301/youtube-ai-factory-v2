import type { Hex64, PolicyCheckCode } from '@youtube-ai-factory/contracts'

export interface OwnerAuthorization {
  readonly id: string
  readonly type: 'AUTHORIZE_RELEASE' | 'AUTHORIZE_PUBLISH'
  readonly packageId: string
  readonly ownerIdentity: string
  readonly ownerActive: boolean
  readonly signature: string
  readonly evidenceHash: Hex64
  readonly createdAt: string
}

export interface ReleaseReadinessInput {
  readonly packageId: string
  readonly masterId: string
  readonly masterTier: 'ARCHIVAL' | 'DISTRIBUTION'
  readonly masterSha256: Hex64
  readonly stages00To14Frozen: boolean
  readonly activeProviderRequests: number
  readonly openExceptions: number
  readonly rightsReconciliationEvidence: string | null
  readonly costReconciliationEvidence: string | null
  readonly hashReconciliationEvidence: string | null
  readonly assuranceGateEffect: 'WARNING_ONLY' | 'HARD_GATE'
  readonly assuranceVerdict: 'PASS' | 'FAIL' | 'NOT_RUN'
  readonly assuranceMasterSha256: Hex64 | null
}

export interface ReleaseAssessment {
  readonly packageId: string
  readonly masterId: string
  readonly masterSha256: Hex64
  readonly state: 'READY' | 'BLOCKED'
  readonly failures: readonly string[]
  readonly canonicalHash: Hex64
}

export interface AuthorizedRelease extends ReleaseAssessment {
  readonly state: 'READY'
  readonly releaseCommandId: string
  readonly releasedBy: string
  readonly releaseEvidenceHash: Hex64
}

export interface PolicyCheckInput {
  readonly code: PolicyCheckCode
  readonly state: 'PASS' | 'FAIL' | 'NOT_EVALUATED'
  readonly evidenceR2Key: string | null
}

export interface PublishChapter {
  readonly startSeconds: number
  readonly title: string
}

export interface PublishMetadata {
  readonly title: string
  readonly description: string
  readonly tags: readonly string[]
  readonly categoryId: string
  readonly privacyStatus: 'private' | 'unlisted' | 'public'
  readonly madeForKids: boolean
  readonly syntheticDisclosure: boolean
  readonly defaultLanguage: string
  readonly chapters: readonly PublishChapter[]
}

export interface ThumbnailArtifact {
  readonly r2Key: string
  readonly sha256: Hex64
  readonly width: number
  readonly height: number
  readonly mimeType: 'image/jpeg' | 'image/png'
  readonly rightsEvidenceR2Key: string
  readonly humanSelectionEvidenceR2Key: string
}

export interface PublishAuthorizationInput {
  readonly release: AuthorizedRelease
  readonly command: OwnerAuthorization
  readonly metadata: PublishMetadata
  readonly thumbnail: ThumbnailArtifact
  readonly checks: readonly PolicyCheckInput[]
  readonly disclosureRecorded: boolean
  readonly disclosureToggle: boolean
  readonly predictedPerformanceHash: Hex64 | null
  readonly channelFrozen: boolean
}

export interface PublishManifest {
  readonly packageId: string
  readonly masterId: string
  readonly masterSha256: Hex64
  readonly releaseCommandId: string
  readonly publishCommandId: string
  readonly authorizedBy: string
  readonly metadata: PublishMetadata
  readonly thumbnail: ThumbnailArtifact
  readonly predictedPerformanceHash: Hex64
  readonly autoPublish: false
  readonly canonicalHash: Hex64
}

export interface UploadSession {
  readonly id: string
  readonly manifestHash: Hex64
  readonly uploadUrlHash: Hex64
  readonly totalBytes: number
  readonly confirmedBytes: number
  readonly state: 'INITIATED' | 'UPLOADING' | 'UPLOADED' | 'VERIFIED' | 'FAILED'
}

export interface UploadChunk {
  readonly start: number
  readonly endExclusive: number
  readonly totalBytes: number
}

export interface YoutubeVideoBinding {
  readonly youtubeVideoId: string
  readonly masterSha256: Hex64
  readonly manifestHash: Hex64
  readonly verificationEvidenceR2Key: string
}
