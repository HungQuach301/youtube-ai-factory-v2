import { z } from 'zod'

import type { FencingToken, Hex64, PackageId, TraceId } from './ids.js'

export const COMMAND_TYPES = [
  'START_STAGE', 'PRODUCE_ARTIFACT', 'VERIFY_ARTIFACT',
  'FREEZE_STAGE', 'REOPEN_ROOT_STAGE',
  'AUTHORIZE_RELEASE', 'AUTHORIZE_PUBLISH', 'PROMOTE_LEARNING',
  'PROMOTE_EVOLUTION', 'RETIRE_GOLD_SAMPLE',
  'FREEZE_CHANNEL', 'UNFREEZE_CHANNEL'
] as const

export type CommandType = typeof COMMAND_TYPES[number]

export const OWNER_COMMANDS: readonly CommandType[] = [
  'AUTHORIZE_RELEASE', 'AUTHORIZE_PUBLISH', 'PROMOTE_LEARNING',
  'PROMOTE_EVOLUTION', 'RETIRE_GOLD_SAMPLE'
] as const

export const OPERATOR_EMERGENCY_COMMANDS: readonly CommandType[] = ['FREEZE_CHANNEL'] as const

export interface CommandBase {
  readonly type: CommandType
  readonly packageId: PackageId
  readonly idempotencyKey: Hex64
  readonly fencingToken: FencingToken
  readonly prevState: string
  readonly traceId: TraceId
}

export interface OwnerCommand extends CommandBase {
  readonly ownerIdentity: string
  readonly signature: string
  readonly evidenceHash: Hex64
}

export type CommandResult =
  | { readonly ok: true; readonly nextState: string }
  | { readonly ok: false; readonly reason: 'STALE_WRITER' | 'DUPLICATE' | 'STATE_CONFLICT' | 'UNAUTHORIZED' | 'DOR_FAILED' | 'POLICY_BLOCKED' | 'CHANNEL_FROZEN' }

const Hex64Schema = z.string().regex(/^[a-f0-9]{64}$/u)

export const CommandBaseSchema = z.object({
  type: z.enum(COMMAND_TYPES),
  packageId: z.string().min(1),
  idempotencyKey: Hex64Schema,
  fencingToken: z.number().int().nonnegative(),
  prevState: z.string().min(1),
  traceId: z.string().min(1)
})

export const OwnerCommandSchema = CommandBaseSchema.extend({
  type: z.enum(OWNER_COMMANDS as [CommandType, ...CommandType[]]),
  ownerIdentity: z.string().min(1),
  signature: z.string().min(1),
  evidenceHash: Hex64Schema
})
