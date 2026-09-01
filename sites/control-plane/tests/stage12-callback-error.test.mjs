import assert from 'node:assert/strict'
import test from 'node:test'

import { stage12CallbackErrorCode } from '../packages/media-worker/stage12-callback-error.mjs'

test('Stage 12 callback keeps every QA gate in a bounded canonical code', () => {
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
  assert.equal(code, `S12QA:${failures.join('.')}`)
  assert.match(code, /^[A-Z0-9_:.-]{1,160}$/u)
})

test('Stage 12 callback rejects untrusted server detail', () => {
  assert.equal(stage12CallbackErrorCode('unsafe callback detail!', 422),
    'STAGE12_CALLBACK_FAILED:422')
})
