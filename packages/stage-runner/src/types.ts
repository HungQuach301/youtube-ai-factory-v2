import type {
  AcceptanceTest,
  Candidate,
  CapabilityRef,
  ChannelId,
  CommandResult,
  DeterministicMeasurements,
  DoRResult,
  FencingToken,
  Hex64,
  PackageId,
  PreflightResult,
  ProfileName,
  StageInstanceId,
  TraceId,
  TournamentSelectionPort,
} from '@youtube-ai-factory/contracts'
import type { ExecuteCommand } from '@youtube-ai-factory/core-command'

export const STAGE_LIFECYCLE_STEPS = [
  'RESOLVE_DOR',
  'VALIDATE_INPUT',
  'PRODUCE_CANDIDATES',
  'TOURNAMENT',
  'PREFLIGHT',
  'PRODUCE_ARTIFACT',
  'READ_BACK_VERIFY',
  'VERIFY_ARTIFACT',
  'FREEZE_STAGE',
] as const

export type StageLifecycleStep = typeof STAGE_LIFECYCLE_STEPS[number]
export type StartingControlState = 'NOT_STARTED' | 'REOPENED'

export interface StageRunRecord {
  readonly stageInstanceId: StageInstanceId
  readonly packageId: PackageId
  readonly channelId: ChannelId
  readonly traceId: TraceId
  readonly fencingToken: FencingToken
  readonly attemptOrdinal: number
  readonly controlState: StartingControlState
  readonly profile: ProfileName
  readonly actorIdentity: string
  readonly input: unknown
  readonly inputHash: Hex64
  readonly measurements: DeterministicMeasurements
}

export interface StageRunRepository {
  load(stageInstanceId: StageInstanceId): Promise<StageRunRecord>
}

export interface StageDoRPort {
  resolve(input: {
    readonly stage: StageRunRecord
    readonly requiredCapabilities: readonly CapabilityRef[]
  }): Promise<DoRResult>
}

export interface StoredArtifact {
  readonly artifactId: string
  readonly contentHash: Hex64
  readonly evidenceHashes: readonly Hex64[]
}

export interface StageArtifactPort {
  produce<Out>(input: {
    readonly stage: StageRunRecord
    readonly stageCode: string
    readonly champion: Candidate<Out>
    readonly preflight: Extract<PreflightResult, { readonly ok: true }>
  }): Promise<StoredArtifact>
}

export type ReadBackResult =
  | { readonly ok: true; readonly evidenceHashes: readonly Hex64[] }
  | { readonly ok: false; readonly failures: readonly string[]; readonly evidenceHashes: readonly Hex64[] }

export interface StageVerificationPort {
  readBack<Out>(input: {
    readonly stage: StageRunRecord
    readonly artifact: StoredArtifact
    readonly expected: Out
    readonly acceptanceTests: readonly AcceptanceTest[]
  }): Promise<ReadBackResult>
}

export interface StageCommandPort {
  execute(command: ExecuteCommand): Promise<CommandResult>
}

export type StageLifecycleErrorCode =
  | 'DOR_FAILED'
  | 'INPUT_SCHEMA_INVALID'
  | 'INPUT_IDENTITY_MISMATCH'
  | 'NO_CANDIDATES'
  | 'INVALID_CHAMPION'
  | 'PREFLIGHT_FAILED'
  | 'PREFLIGHT_EVIDENCE_MISSING'
  | 'NO_ACCEPTANCE_TESTS'
  | 'READ_BACK_FAILED'
  | 'READ_BACK_EVIDENCE_MISSING'
  | 'COMMAND_REJECTED'
  | 'COMMAND_STATE_MISMATCH'

export interface StageFailureEvidence {
  readonly stage: StageRunRecord
  readonly step: StageLifecycleStep
  readonly code: StageLifecycleErrorCode
  readonly failures: readonly string[]
  readonly evidenceHashes: readonly Hex64[]
}

export interface StageEvidencePort {
  recordFailure(input: StageFailureEvidence): Promise<void>
}

export interface StageLifecycleObserver {
  onStep(input: {
    readonly stage: StageRunRecord
    readonly step: StageLifecycleStep
  }): Promise<void>
}

export interface StageRunnerPorts<Out> {
  readonly repository: StageRunRepository
  readonly dor: StageDoRPort
  readonly tournament: TournamentSelectionPort<Out>
  readonly artifacts: StageArtifactPort
  readonly verification: StageVerificationPort
  readonly commands: StageCommandPort
  readonly evidence: StageEvidencePort
  readonly observer: StageLifecycleObserver
}
