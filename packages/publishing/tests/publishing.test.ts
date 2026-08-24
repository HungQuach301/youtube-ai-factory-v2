import { describe, expect, it } from 'vitest'

import type { Hex64 } from '@youtube-ai-factory/contracts'

import {
  PublishingError,
  acknowledgeUploadChunk,
  assessReleaseReadiness,
  authorizePublish,
  authorizeRelease,
  createUploadSession,
  nextUploadChunk,
  verifyUpload,
  type OwnerAuthorization,
  type PublishAuthorizationInput,
} from '../src/index.js'

const hash = (character: string): Hex64 => character.repeat(64) as Hex64
const at = '2026-08-24T02:30:00.000Z'
const ownerCommand = (
  type: OwnerAuthorization['type'],
  id: string,
): OwnerAuthorization => ({
  id, type, packageId: 'pkg', ownerIdentity: 'real-human-owner', ownerActive: true,
  signature: `signature-${id}`, evidenceHash: hash(type === 'AUTHORIZE_RELEASE' ? 'a' : 'b'), createdAt: at,
})

const releaseInput = {
  packageId: 'pkg', masterId: 'distribution-master', masterTier: 'DISTRIBUTION' as const,
  masterSha256: hash('c'), stages00To14Frozen: true, activeProviderRequests: 0,
  openExceptions: 0, rightsReconciliationEvidence: 'evidence/rights.json',
  costReconciliationEvidence: 'evidence/cost.json', hashReconciliationEvidence: 'evidence/hashes.json',
  assuranceGateEffect: 'WARNING_ONLY' as const, assuranceVerdict: 'PASS' as const,
  assuranceMasterSha256: hash('c'),
}

const release = () => authorizeRelease(
  assessReleaseReadiness(releaseInput),
  ownerCommand('AUTHORIZE_RELEASE', 'release-command'),
)

const checks = (state: 'PASS' | 'FAIL' = 'PASS') =>
  (['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'PC8'] as const).map((code) => ({
    code, state, evidenceR2Key: `policy/${code}.json`,
  }))

const publishInput = (overrides: Partial<PublishAuthorizationInput> = {}): PublishAuthorizationInput => ({
  release: release(),
  command: ownerCommand('AUTHORIZE_PUBLISH', 'publish-command'),
  metadata: {
    title: 'Why settlement queues become invisible',
    description: 'A sourced mechanism explanation.',
    tags: ['payments', 'systems'], categoryId: '28', privacyStatus: 'private',
    madeForKids: false, syntheticDisclosure: true, defaultLanguage: 'en',
    chapters: [{ startSeconds: 0, title: 'The queue' }, { startSeconds: 60, title: 'The mechanism' }],
  },
  thumbnail: {
    r2Key: 'publish/thumbnail.png', sha256: hash('d'), width: 1280, height: 720,
    mimeType: 'image/png', rightsEvidenceR2Key: 'rights/thumbnail.json',
    humanSelectionEvidenceR2Key: 'human/d3-thumbnail.json',
  },
  checks: checks(), disclosureRecorded: true, disclosureToggle: true,
  predictedPerformanceHash: hash('e'), channelFrozen: false,
  ...overrides,
})

describe('PUB-01 release and publish authorization', () => {
  it('separates owner release from owner publish and hard-codes auto-publish OFF', () => {
    const manifest = authorizePublish(publishInput())
    expect(manifest.releaseCommandId).toBe('release-command')
    expect(manifest.publishCommandId).toBe('publish-command')
    expect(manifest.autoPublish).toBe(false)
    expect(manifest.canonicalHash).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('blocks release when the final reconciliation is not bound to the master', () => {
    const assessment = assessReleaseReadiness({
      ...releaseInput, activeProviderRequests: 1, assuranceMasterSha256: hash('f'),
    })
    expect(assessment.state).toBe('BLOCKED')
    expect(() => authorizeRelease(assessment, ownerCommand('AUTHORIZE_RELEASE', 'release')))
      .toThrow(PublishingError)
  })

  it('blocks AUTHORIZE_PUBLISH without prediction or any PC1–PC8 PASS evidence', () => {
    expect(() => authorizePublish(publishInput({ predictedPerformanceHash: null })))
      .toThrow(/SEALED_PREDICTION_MISSING/u)
    expect(() => authorizePublish(publishInput({ checks: checks().slice(1) })))
      .toThrow(/POLICY_CHECK_MISSING:PC1/u)
    expect(() => authorizePublish(publishInput({ checks: checks('FAIL') })))
      .toThrow(/POLICY_CHECK_NOT_PASS:PC8/u)
  })

  it('uses only explicit artifact flags and rejects disclosure or thumbnail drift', () => {
    expect(() => authorizePublish(publishInput({ disclosureToggle: false })))
      .toThrow(/DISCLOSURE_METADATA_MISMATCH/u)
    expect(() => authorizePublish(publishInput({
      thumbnail: { ...publishInput().thumbnail, width: 1279 },
    }))).toThrow(/THUMBNAIL_DIMENSIONS_INVALID/u)
  })
})

describe('resumable upload ledger', () => {
  it('resumes from the server-confirmed offset and never acknowledges bytes twice', () => {
    const initial = createUploadSession({
      id: 'upload', manifestHash: hash('a'), uploadUrlHash: hash('b'), totalBytes: 9_000_000,
    })
    const first = nextUploadChunk(initial)
    expect(first).not.toBeNull()
    const resumed = acknowledgeUploadChunk(initial, first!, first!.endExclusive)
    expect(nextUploadChunk(resumed)?.start).toBe(first!.endExclusive)
    expect(() => acknowledgeUploadChunk(resumed, first!, first!.endExclusive))
      .toThrow(/NON_MONOTONIC_OR_MISMATCHED_ACK/u)
  })

  it('binds the YouTube video ID to the exact master checksum only after verification evidence', () => {
    const initial = createUploadSession({
      id: 'upload', manifestHash: hash('a'), uploadUrlHash: hash('b'), totalBytes: 100,
    })
    const chunk = nextUploadChunk(initial)!
    const uploaded = acknowledgeUploadChunk(initial, chunk, 100)
    const verified = verifyUpload(uploaded, 'youtube-video-id', hash('c'), 'publish/readback.json')
    expect(verified.session.state).toBe('VERIFIED')
    expect(verified.binding).toMatchObject({ youtubeVideoId: 'youtube-video-id', masterSha256: hash('c') })
  })
})
