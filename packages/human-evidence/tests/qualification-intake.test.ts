import { describe, expect, test } from 'vitest'

import {
  createQualificationIntakeTemplate,
  evaluateQualificationIntake,
  QUALIFICATION_ANCHOR_VERDICTS,
  QUALIFICATION_ASSURANCE_DIMENSIONS,
  QUALIFICATION_DEFECT_CLASSES,
  QualificationEvidenceAssetSchema,
  type QualificationIntakePacket,
} from '../src/qualification-intake.js'

const createdAt = '2026-08-28T00:00:00.000Z'
const owner = { identity: 'owner-key-01', role: 'OWNER' as const, isService: false as const, active: true }
const hash = (index: number) => index.toString(16).padStart(64, '0')
const asset = (index: number, mediaType: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'JSON') => ({
  r2Key: `qualification/g-02f/evidence-${index}`,
  sha256: hash(index),
  sizeBytes: index + 1,
  mediaType,
})
const judgment = {
  actorIdentity: owner.identity,
  rationale: 'The owner reviewed this real evidence and recorded a substantive reason.',
  decidedAt: createdAt,
}

function completePacket(): QualificationIntakePacket {
  const rejectedMasters = Array.from({ length: 15 }, (_, index) => ({
    id: `rejected-${index}`,
    source: 'rejected_master' as const,
    asset: asset(index + 1, 'VIDEO'),
    groundTruth: {
      defectClass: QUALIFICATION_DEFECT_CLASSES[index % QUALIFICATION_DEFECT_CLASSES.length]!,
      severity: 'P1' as const,
      tStart: 0,
      tEnd: 1,
    },
    ownerJudgment: judgment,
  }))
  const alignerSamples = Array.from({ length: 10 }, (_, index) => ({
    id: `aligner-${index}`,
    provenance: 'human_reader' as const,
    asset: asset(index + 100, 'AUDIO'),
    readerIdentity: 'human-reader-01',
    speakerId: 'speaker-01',
    transcript: `Exact human transcript ${index}`,
    durationSec: 3,
    recordedAt: createdAt,
    referencePhonemes: null,
    observedPhonemes: null,
  }))
  const rubricAnchors = QUALIFICATION_ASSURANCE_DIMENSIONS.flatMap((dimension, dimensionIndex) =>
    QUALIFICATION_ANCHOR_VERDICTS.map((verdict, verdictIndex) => {
      const index = 200 + dimensionIndex * QUALIFICATION_ANCHOR_VERDICTS.length + verdictIndex
      return {
        id: `anchor-${dimension}-${verdict}`,
        dimension,
        verdict,
        description: `${dimension} ${verdict} real evidence`,
        asset: asset(index, 'VIDEO'),
        ownerJudgment: judgment,
      }
    }))
  return {
    ...createQualificationIntakeTemplate(createdAt),
    ownerActorIdentity: owner.identity,
    rejectedMasters,
    alignerSamples,
    rubricAnchors,
  }
}

describe('G-02F human evidence intake', () => {
  test('creates a deterministic zero-provider template that fails closed', () => {
    const packet = createQualificationIntakeTemplate(createdAt)
    const result = evaluateQualificationIntake({ packet, actors: [], readbacks: [] })
    expect(packet).toEqual(createQualificationIntakeTemplate(createdAt))
    expect(packet).toMatchObject({ state: 'DRAFT_ONLY', productionEligible: false, providerDispatch: 'OFF' })
    expect(result).toMatchObject({ intakeComplete: false, qualificationState: 'NOT_QUALIFIED', providerCallCount: 0 })
    expect(result.blockers).toContain('ACTIVE_OWNER_ALLOWLIST_IDENTITY_REQUIRED')
  })

  test('rejects evidence outside the qualification namespace', () => {
    expect(() => QualificationEvidenceAssetSchema.parse({
      ...asset(1, 'VIDEO'),
      r2Key: 'production/master.mp4',
    })).toThrow(/qualification namespace/iu)
  })

  test('accepts a complete sealed intake but keeps qualification and production disabled', () => {
    const packet = completePacket()
    const readbacks = [
      ...packet.rejectedMasters.map((item) => item.asset),
      ...packet.alignerSamples.map((item) => item.asset),
      ...packet.rubricAnchors.map((item) => item.asset),
    ].map(({ r2Key, sha256, sizeBytes }) => ({ r2Key, sha256, sizeBytes }))
    const result = evaluateQualificationIntake({ packet, actors: [owner], readbacks })
    expect(result).toMatchObject({
      intakeComplete: true,
      alignerEvidenceComplete: true,
      calibrationInputComplete: false,
      qualificationState: 'NOT_QUALIFIED',
      productionEligible: false,
      providerCallCount: 0,
    })
    expect(result.counts).toEqual({
      rejectedMasters: 15,
      reviewedRejectedMasters: 15,
      alignerSamples: 10,
      rubricAnchors: 36,
      reviewedRubricAnchors: 36,
      sealedAssets: 61,
    })
    expect(result.blockers).toEqual(['ALIGNER_PHONEME_INPUTS_PENDING'])
  })

  test('fails read-back when declared bytes do not match', () => {
    const packet = completePacket()
    const first = packet.rejectedMasters[0]!.asset
    const result = evaluateQualificationIntake({
      packet,
      actors: [owner],
      readbacks: [{ r2Key: first.r2Key, sha256: 'f'.repeat(64), sizeBytes: first.sizeBytes }],
    })
    expect(result.intakeComplete).toBe(false)
    expect(result.blockers).toContain(`EVIDENCE_READBACK_MISMATCH:${first.r2Key}`)
  })
})
