import type { CommandType } from '@youtube-ai-factory/contracts'

export type StateTargetKind =
  | 'STAGE_INSTANCE'
  | 'PACKAGE'
  | 'LEARNING'
  | 'EVOLUTION_PROPOSAL'
  | 'GOLD_SAMPLE'
  | 'CHANNEL'

interface StateTransition {
  readonly from: string
  readonly to: string
}

export const COMMAND_TRANSITIONS = {
  START_STAGE: [{ from: 'NOT_STARTED', to: 'RUNNING' }, { from: 'REOPENED', to: 'RUNNING' }],
  PRODUCE_ARTIFACT: [{ from: 'RUNNING', to: 'PRODUCED' }],
  VERIFY_ARTIFACT: [{ from: 'PRODUCED', to: 'VERIFIED' }],
  FREEZE_STAGE: [{ from: 'VERIFIED', to: 'FROZEN' }],
  REOPEN_ROOT_STAGE: [{ from: 'FROZEN', to: 'REOPENED' }],
  AUTHORIZE_RELEASE: [{ from: 'RUNNING', to: 'RELEASED' }],
  AUTHORIZE_PUBLISH: [{ from: 'RELEASED', to: 'PUBLISHED' }],
  PROMOTE_LEARNING: [{ from: 'EVIDENCE_READY', to: 'PROMOTED' }],
  PROMOTE_EVOLUTION: [{ from: 'EVIDENCE_READY', to: 'PROMOTED' }],
  RETIRE_GOLD_SAMPLE: [{ from: 'ACTIVE', to: 'RETIRED' }],
  FREEZE_CHANNEL: [{ from: 'ACTIVE', to: 'FROZEN' }, { from: 'PAUSED', to: 'FROZEN' }],
  UNFREEZE_CHANNEL: [{ from: 'FROZEN', to: 'ACTIVE' }],
} as const satisfies Record<CommandType, readonly StateTransition[]>

const COMMAND_TARGETS = {
  START_STAGE: 'STAGE_INSTANCE',
  PRODUCE_ARTIFACT: 'STAGE_INSTANCE',
  VERIFY_ARTIFACT: 'STAGE_INSTANCE',
  FREEZE_STAGE: 'STAGE_INSTANCE',
  REOPEN_ROOT_STAGE: 'STAGE_INSTANCE',
  AUTHORIZE_RELEASE: 'PACKAGE',
  AUTHORIZE_PUBLISH: 'PACKAGE',
  PROMOTE_LEARNING: 'LEARNING',
  PROMOTE_EVOLUTION: 'EVOLUTION_PROPOSAL',
  RETIRE_GOLD_SAMPLE: 'GOLD_SAMPLE',
  FREEZE_CHANNEL: 'CHANNEL',
  UNFREEZE_CHANNEL: 'CHANNEL',
} as const satisfies Record<CommandType, StateTargetKind>

export class StateConflictError extends Error {
  constructor(commandType: CommandType, state: string) {
    super(`STATE_CONFLICT: ${commandType} cannot transition from ${state}`)
    this.name = 'StateConflictError'
  }
}

export function nextStateFor(commandType: CommandType, currentState: string): string {
  const transition = COMMAND_TRANSITIONS[commandType].find((candidate) => candidate.from === currentState)
  if (transition === undefined) throw new StateConflictError(commandType, currentState)
  return transition.to
}

export function commandTargetKind(commandType: CommandType): StateTargetKind {
  return COMMAND_TARGETS[commandType]
}
