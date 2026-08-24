import type { Hex64, PolicyCheckCode } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import type {
  AuthorizedRelease,
  OwnerAuthorization,
  PolicyCheckInput,
  PublishAuthorizationInput,
  PublishManifest,
  ReleaseAssessment,
  ReleaseReadinessInput,
  UploadChunk,
  UploadSession,
  YoutubeVideoBinding,
} from './types.js'

export type PublishingErrorCode =
  | 'RELEASE_BLOCKED'
  | 'OWNER_AUTHORIZATION_INVALID'
  | 'PUBLISH_AUTHORIZATION_BLOCKED'
  | 'UPLOAD_STATE_INVALID'

export class PublishingError extends Error {
  override readonly name = 'PublishingError'

  constructor(readonly code: PublishingErrorCode, readonly failures: readonly string[]) {
    super(`${code}: ${failures.join('; ')}`)
  }
}

const CHECK_CODES = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'PC8'] as const
const HEX_64 = /^[0-9a-f]{64}$/u
const YOUTUBE_RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024

function validAuthorization(
  command: OwnerAuthorization,
  expectedType: OwnerAuthorization['type'],
  packageId: string,
): boolean {
  return command.type === expectedType
    && command.packageId === packageId
    && command.ownerActive
    && command.ownerIdentity.trim().length > 0
    && command.signature.trim().length > 0
    && HEX_64.test(command.evidenceHash)
    && Number.isFinite(Date.parse(command.createdAt))
}

export function assessReleaseReadiness(input: ReleaseReadinessInput): ReleaseAssessment {
  const failures: string[] = []
  if (input.masterTier !== 'DISTRIBUTION') failures.push('DISTRIBUTION_MASTER_REQUIRED')
  if (!input.stages00To14Frozen) failures.push('STAGES_00_TO_14_NOT_FROZEN')
  if (!Number.isSafeInteger(input.activeProviderRequests) || input.activeProviderRequests !== 0) {
    failures.push('ACTIVE_PROVIDER_REQUESTS_PRESENT')
  }
  if (!Number.isSafeInteger(input.openExceptions) || input.openExceptions !== 0) {
    failures.push('OPEN_EXCEPTIONS_PRESENT')
  }
  if (input.rightsReconciliationEvidence?.trim().length === 0
    || input.rightsReconciliationEvidence === null) failures.push('RIGHTS_NOT_RECONCILED')
  if (input.costReconciliationEvidence?.trim().length === 0
    || input.costReconciliationEvidence === null) failures.push('COST_NOT_RECONCILED')
  if (input.hashReconciliationEvidence?.trim().length === 0
    || input.hashReconciliationEvidence === null) failures.push('HASHES_NOT_RECONCILED')
  if (input.assuranceMasterSha256 !== input.masterSha256) failures.push('ASSURANCE_MASTER_HASH_MISMATCH')
  if (input.assuranceGateEffect === 'HARD_GATE' && input.assuranceVerdict !== 'PASS') {
    failures.push('HARD_ASSURANCE_NOT_PASS')
  }
  if (input.assuranceGateEffect === 'WARNING_ONLY' && input.assuranceVerdict === 'FAIL') {
    failures.push('WARNING_ASSURANCE_REPORTED_FAILURE')
  }
  const payload = {
    package_id: input.packageId,
    master_id: input.masterId,
    master_sha256: input.masterSha256,
    assurance_gate_effect: input.assuranceGateEffect,
    assurance_verdict: input.assuranceVerdict,
    failures: [...failures].sort(),
  }
  return {
    packageId: input.packageId,
    masterId: input.masterId,
    masterSha256: input.masterSha256,
    state: failures.length === 0 ? 'READY' : 'BLOCKED',
    failures,
    canonicalHash: canonicalHash(payload),
  }
}

export function authorizeRelease(
  assessment: ReleaseAssessment,
  command: OwnerAuthorization,
): AuthorizedRelease {
  if (assessment.state !== 'READY') throw new PublishingError('RELEASE_BLOCKED', assessment.failures)
  if (!validAuthorization(command, 'AUTHORIZE_RELEASE', assessment.packageId)) {
    throw new PublishingError('OWNER_AUTHORIZATION_INVALID', ['AUTHORIZE_RELEASE_INVALID'])
  }
  return {
    ...assessment,
    state: 'READY',
    releaseCommandId: command.id,
    releasedBy: command.ownerIdentity,
    releaseEvidenceHash: command.evidenceHash,
  }
}

function checkPolicy(checks: readonly PolicyCheckInput[]): readonly string[] {
  const failures: string[] = []
  const byCode = new Map<PolicyCheckCode, PolicyCheckInput>()
  for (const check of checks) {
    if (byCode.has(check.code)) failures.push(`DUPLICATE_POLICY_CHECK:${check.code}`)
    byCode.set(check.code, check)
  }
  for (const code of CHECK_CODES) {
    const check = byCode.get(code)
    if (check === undefined) failures.push(`POLICY_CHECK_MISSING:${code}`)
    else if (check.state !== 'PASS' || check.evidenceR2Key?.trim().length === 0
      || check.evidenceR2Key === null) failures.push(`POLICY_CHECK_NOT_PASS:${code}`)
  }
  return failures
}

function validateMetadata(input: PublishAuthorizationInput): readonly string[] {
  const failures: string[] = []
  const metadata = input.metadata
  if (metadata.title.trim().length === 0 || metadata.title.length > 100) failures.push('TITLE_INVALID')
  if (metadata.description.trim().length === 0 || metadata.description.length > 5_000) failures.push('DESCRIPTION_INVALID')
  if (metadata.tags.length === 0 || metadata.tags.some((tag) => tag.trim().length === 0)) failures.push('TAGS_INVALID')
  if (!/^\d+$/u.test(metadata.categoryId)) failures.push('CATEGORY_ID_INVALID')
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(metadata.defaultLanguage)) failures.push('LANGUAGE_INVALID')
  if (metadata.syntheticDisclosure !== input.disclosureToggle) failures.push('DISCLOSURE_METADATA_MISMATCH')
  if (input.thumbnail.width !== 1280 || input.thumbnail.height !== 720) failures.push('THUMBNAIL_DIMENSIONS_INVALID')
  if (input.thumbnail.r2Key.trim().length === 0
    || input.thumbnail.rightsEvidenceR2Key.trim().length === 0
    || input.thumbnail.humanSelectionEvidenceR2Key.trim().length === 0) failures.push('THUMBNAIL_EVIDENCE_MISSING')
  let previous = -1
  for (const chapter of metadata.chapters) {
    if (!Number.isSafeInteger(chapter.startSeconds) || chapter.startSeconds < 0
      || chapter.startSeconds <= previous || chapter.title.trim().length === 0) failures.push('CHAPTERS_INVALID')
    previous = chapter.startSeconds
  }
  return failures
}

export function authorizePublish(input: PublishAuthorizationInput): PublishManifest {
  const failures = [...checkPolicy(input.checks), ...validateMetadata(input)]
  if (!validAuthorization(input.command, 'AUTHORIZE_PUBLISH', input.release.packageId)) {
    failures.push('AUTHORIZE_PUBLISH_INVALID')
  }
  if (input.command.id === input.release.releaseCommandId) failures.push('RELEASE_AND_PUBLISH_COMMANDS_NOT_DISTINCT')
  if (!input.disclosureRecorded) failures.push('DISCLOSURE_DECISION_MISSING')
  if (input.predictedPerformanceHash === null) failures.push('SEALED_PREDICTION_MISSING')
  if (input.channelFrozen) failures.push('CHANNEL_FROZEN')
  if (failures.length > 0 || input.predictedPerformanceHash === null) {
    throw new PublishingError('PUBLISH_AUTHORIZATION_BLOCKED', failures)
  }
  const payload = {
    package_id: input.release.packageId,
    master_id: input.release.masterId,
    master_sha256: input.release.masterSha256,
    release_command_id: input.release.releaseCommandId,
    publish_command_id: input.command.id,
    authorized_by: input.command.ownerIdentity,
    metadata: input.metadata,
    thumbnail: input.thumbnail,
    predicted_performance_hash: input.predictedPerformanceHash,
    auto_publish: false,
  }
  return { ...payload, packageId: payload.package_id, masterId: payload.master_id,
    masterSha256: payload.master_sha256, releaseCommandId: payload.release_command_id,
    publishCommandId: payload.publish_command_id, authorizedBy: payload.authorized_by,
    predictedPerformanceHash: payload.predicted_performance_hash, autoPublish: false,
    canonicalHash: canonicalHash(payload) }
}

export function createUploadSession(input: {
  readonly id: string
  readonly manifestHash: Hex64
  readonly uploadUrlHash: Hex64
  readonly totalBytes: number
}): UploadSession {
  if (!Number.isSafeInteger(input.totalBytes) || input.totalBytes <= 0) {
    throw new PublishingError('UPLOAD_STATE_INVALID', ['TOTAL_BYTES_INVALID'])
  }
  return { ...input, confirmedBytes: 0, state: 'INITIATED' }
}

export function nextUploadChunk(session: UploadSession): UploadChunk | null {
  if (session.state === 'VERIFIED' || session.state === 'FAILED') return null
  if (session.confirmedBytes === session.totalBytes) return null
  return {
    start: session.confirmedBytes,
    endExclusive: Math.min(session.totalBytes, session.confirmedBytes + YOUTUBE_RESUMABLE_CHUNK_BYTES),
    totalBytes: session.totalBytes,
  }
}

export function acknowledgeUploadChunk(
  session: UploadSession,
  chunk: UploadChunk,
  confirmedBytes: number,
): UploadSession {
  if (chunk.start !== session.confirmedBytes || chunk.totalBytes !== session.totalBytes
    || confirmedBytes !== chunk.endExclusive || confirmedBytes <= session.confirmedBytes
    || confirmedBytes > session.totalBytes) {
    throw new PublishingError('UPLOAD_STATE_INVALID', ['NON_MONOTONIC_OR_MISMATCHED_ACK'])
  }
  return { ...session, confirmedBytes, state: confirmedBytes === session.totalBytes ? 'UPLOADED' : 'UPLOADING' }
}

export function verifyUpload(
  session: UploadSession,
  youtubeVideoId: string,
  masterSha256: Hex64,
  verificationEvidenceR2Key: string,
): { readonly session: UploadSession; readonly binding: YoutubeVideoBinding } {
  if (session.state !== 'UPLOADED' || session.confirmedBytes !== session.totalBytes
    || youtubeVideoId.trim().length === 0 || verificationEvidenceR2Key.trim().length === 0) {
    throw new PublishingError('UPLOAD_STATE_INVALID', ['UPLOAD_NOT_READY_FOR_VERIFICATION'])
  }
  return {
    session: { ...session, state: 'VERIFIED' },
    binding: { youtubeVideoId, masterSha256, manifestHash: session.manifestHash, verificationEvidenceR2Key },
  }
}

export type * from './types.js'
