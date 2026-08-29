import { describe, expect, test } from 'vitest'

import {
  createDualCalibrationPlan,
  DUAL_CALIBRATION_DATASET,
  evaluateDualCalibrationReadiness,
} from '../src/dual-calibration-plan.js'

const createdAt = '2026-08-29T00:00:00.000Z'

describe('G-02G dual calibration plan', () => {
  test('pins a non-rehosting American English human corpus and the registered production voice', () => {
    const plan = createDualCalibrationPlan(createdAt)
    expect(plan).toMatchObject({
      state: 'OWNER_ACTION_REQUIRED',
      providerDispatch: 'OFF',
      productionEligible: false,
      corpus: {
        datasetId: DUAL_CALIBRATION_DATASET.datasetId,
        locale: 'en-US',
        licenseId: 'CC0-1.0',
        retainSourceAudio: false,
        allowSpeakerReidentification: false,
      },
      productionVoice: {
        voiceId: 'KXyrWqXTuK63FlJ9XZ33',
        maySetErrorFloor: false,
      },
    })
  })

  test('fails closed until the owner terms and both provider credentials are present', () => {
    const plan = createDualCalibrationPlan(createdAt)
    const readiness = evaluateDualCalibrationReadiness(plan, {
      mdcTermsAccepted: false,
      mdcApiCredentialConfigured: false,
      elevenLabsApiCredentialConfigured: true,
      productionVoiceRegistered: true,
    })
    expect(readiness.readyForExecution).toBe(false)
    expect(readiness.blockers).toEqual([
      'MDC_DATASET_TERMS_ACCEPTANCE_REQUIRED',
      'MDC_API_CREDENTIAL_REQUIRED',
    ])
  })

  test('becomes execution-ready without enabling provider dispatch or production', () => {
    const plan = createDualCalibrationPlan(createdAt)
    const readiness = evaluateDualCalibrationReadiness(plan, {
      mdcTermsAccepted: true,
      mdcApiCredentialConfigured: true,
      elevenLabsApiCredentialConfigured: true,
      productionVoiceRegistered: true,
    })
    expect(readiness).toEqual({
      readyForExecution: true,
      providerDispatch: 'OFF',
      productionEligible: false,
      blockers: [],
    })
  })
})
