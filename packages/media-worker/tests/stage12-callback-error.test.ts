import { describe, expect, it } from 'vitest'

import { stage12CallbackErrorCode } from '../stage12-callback-error.mjs'

describe('Stage 12 callback error contract', () => {
  it('compacts every QA failure without losing the failing gates', () => {
    const failures = [
      'CONTROL_CONTRACT',
      'TECHNICAL_DEFECT',
      'LOUDNESS',
      'TRUE_PEAK',
      'BLACK_FRAME',
      'FREEZE_FRAME',
      'AV_SYNC',
      'DURATION',
      'RESOLUTION',
      'FRAME_RATE',
    ]
    const code = stage12CallbackErrorCode(
      `TRACK_G_STAGE_12_QA_FAILED:${failures.join(',')}`,
      422,
    )

    expect(code).toBe(`S12QA:${failures.join('.')}`)
    expect(code).toMatch(/^[A-Z0-9_:.-]{1,160}$/u)
    expect(code.length).toBeLessThanOrEqual(160)
  })

  it('preserves existing safe worker and storage codes', () => {
    expect(stage12CallbackErrorCode('STAGE12_PRE_MASTER_HASH_MISMATCH', 422))
      .toBe('STAGE12_PRE_MASTER_HASH_MISMATCH')
  })

  it('falls back for untrusted or oversized callback bodies', () => {
    expect(stage12CallbackErrorCode('unsafe callback detail!', 422))
      .toBe('STAGE12_CALLBACK_FAILED:422')
    expect(stage12CallbackErrorCode('A'.repeat(161), 503))
      .toBe('STAGE12_CALLBACK_FAILED:503')
  })
})
