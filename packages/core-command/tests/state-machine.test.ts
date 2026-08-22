import { describe, expect, it } from 'vitest'

import {
  COMMAND_TRANSITIONS,
  commandTargetKind,
  nextStateFor,
} from '../src/state-machine.js'

describe('typed command state machine', () => {
  it('defines one deterministic transition for all 12 commands', () => {
    expect(Object.keys(COMMAND_TRANSITIONS)).toHaveLength(12)
    expect(nextStateFor('START_STAGE', 'NOT_STARTED')).toBe('RUNNING')
    expect(nextStateFor('PRODUCE_ARTIFACT', 'RUNNING')).toBe('PRODUCED')
    expect(nextStateFor('VERIFY_ARTIFACT', 'PRODUCED')).toBe('VERIFIED')
    expect(nextStateFor('FREEZE_STAGE', 'VERIFIED')).toBe('FROZEN')
    expect(nextStateFor('REOPEN_ROOT_STAGE', 'FROZEN')).toBe('REOPENED')
    expect(nextStateFor('AUTHORIZE_RELEASE', 'RUNNING')).toBe('RELEASED')
    expect(nextStateFor('AUTHORIZE_PUBLISH', 'RELEASED')).toBe('PUBLISHED')
    expect(nextStateFor('PROMOTE_LEARNING', 'EVIDENCE_READY')).toBe('PROMOTED')
    expect(nextStateFor('PROMOTE_EVOLUTION', 'EVIDENCE_READY')).toBe('PROMOTED')
    expect(nextStateFor('RETIRE_GOLD_SAMPLE', 'ACTIVE')).toBe('RETIRED')
    expect(nextStateFor('FREEZE_CHANNEL', 'ACTIVE')).toBe('FROZEN')
    expect(nextStateFor('UNFREEZE_CHANNEL', 'FROZEN')).toBe('ACTIVE')
  })

  it('fails closed for an invalid transition', () => {
    expect(() => nextStateFor('START_STAGE', 'VERIFIED')).toThrow(/STATE_CONFLICT/u)
  })

  it('maps commands to the state aggregate they own', () => {
    expect(commandTargetKind('START_STAGE')).toBe('STAGE_INSTANCE')
    expect(commandTargetKind('AUTHORIZE_RELEASE')).toBe('PACKAGE')
    expect(commandTargetKind('PROMOTE_LEARNING')).toBe('LEARNING')
    expect(commandTargetKind('PROMOTE_EVOLUTION')).toBe('EVOLUTION_PROPOSAL')
    expect(commandTargetKind('RETIRE_GOLD_SAMPLE')).toBe('GOLD_SAMPLE')
    expect(commandTargetKind('FREEZE_CHANNEL')).toBe('CHANNEL')
  })
})
