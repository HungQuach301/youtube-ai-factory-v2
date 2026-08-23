import { StageRunner as StageRunnerContract, thresholds } from '@youtube-ai-factory/contracts'
import type {
  AcceptanceTest,
  Candidate,
  CapabilityRef,
  CommandType,
  Hex64,
  PreflightContext,
  PreflightResult,
  RunContext,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'
import type { ExecuteCommand } from '@youtube-ai-factory/core-command'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import type { z } from 'zod'

import type {
  StageLifecycleErrorCode,
  StageLifecycleStep,
  StageRunRecord,
  StageRunnerPorts,
} from './types.js'

type StageCommandType = Extract<CommandType,
  'START_STAGE' | 'PRODUCE_ARTIFACT' | 'VERIFY_ARTIFACT' | 'FREEZE_STAGE'>

const EXPECTED_STATE = {
  START_STAGE: 'RUNNING',
  PRODUCE_ARTIFACT: 'PRODUCED',
  VERIFY_ARTIFACT: 'VERIFIED',
  FREEZE_STAGE: 'FROZEN',
} as const satisfies Record<StageCommandType, string>

export class StageLifecycleError extends Error {
  override readonly name = 'StageLifecycleError'

  constructor(
    readonly code: StageLifecycleErrorCode,
    readonly step: StageLifecycleStep,
    readonly failures: readonly string[],
  ) {
    super(`${code} at ${step}: ${failures.join('; ')}`)
  }
}

function fail(
  code: StageLifecycleErrorCode,
  step: StageLifecycleStep,
  failures: readonly string[],
): never {
  throw new StageLifecycleError(code, step, failures)
}

function commandKey(stageRunKey: Hex64, type: StageCommandType): Hex64 {
  return canonicalHash({ command_type: type, stage_run_key: stageRunKey })
}

export abstract class StageRunner<In, Out> extends StageRunnerContract<In, Out> {
  constructor(private readonly ports: StageRunnerPorts<Out>) { super() }

  abstract override readonly stageCode: string
  abstract override requiredCapabilities(): readonly CapabilityRef[]
  abstract override inputSchema(): z.ZodType<In>
  abstract override produce(input: In, context: RunContext): Promise<readonly Candidate<Out>[]>
  abstract override preflight(candidate: Out, context: PreflightContext): Promise<PreflightResult>
  abstract override acceptanceTests(output: Out): readonly AcceptanceTest[]

  /** @final The nine-phase lifecycle is framework-owned and must not be overridden. */
  override async run(stageInstanceId: StageInstanceId): Promise<void> {
    const stage = await this.ports.repository.load(stageInstanceId)
    const runKey = canonicalHash({
      attempt_ordinal: stage.attemptOrdinal,
      input_hash: stage.inputHash,
      stage_instance_id: stage.stageInstanceId,
    })

    await this.observe(stage, 'RESOLVE_DOR')
    const dor = await this.ports.dor.resolve({
      stage,
      requiredCapabilities: this.requiredCapabilities(),
    })
    if (!dor.ready) {
      fail('DOR_FAILED', 'RESOLVE_DOR', dor.failures.map((failure) => (
        `${failure.condition}: expected ${failure.expected}, actual ${failure.actual}`
      )))
    }

    await this.observe(stage, 'VALIDATE_INPUT')
    const parsed = this.inputSchema().safeParse(stage.input)
    if (!parsed.success) {
      fail('INPUT_SCHEMA_INVALID', 'VALIDATE_INPUT', parsed.error.issues.map((issue) => issue.message))
    }
    let parsedHash: Hex64
    try {
      parsedHash = canonicalHash(parsed.data)
    } catch (error: unknown) {
      fail('INPUT_SCHEMA_INVALID', 'VALIDATE_INPUT', [
        error instanceof Error ? error.message : 'Input cannot be canonicalized.',
      ])
    }
    if (parsedHash !== stage.inputHash) {
      fail('INPUT_IDENTITY_MISMATCH', 'VALIDATE_INPUT', [
        'Schema parsing changed canonical input identity; defaults and transforms are forbidden.',
      ])
    }

    await this.issue(stage, runKey, 'START_STAGE', stage.controlState, {
      attempt_ordinal: stage.attemptOrdinal,
      input_hash: stage.inputHash,
      profile: stage.profile,
      stage_code: this.stageCode,
    })

    const context: RunContext = {
      packageId: stage.packageId,
      stageInstanceId: stage.stageInstanceId,
      traceId: stage.traceId,
      profile: stage.profile,
      profileSettings: thresholds.PROFILE[stage.profile],
    }

    await this.observe(stage, 'PRODUCE_CANDIDATES')
    const candidates = await this.produce(parsed.data, context)
    if (candidates.length === 0) {
      fail('NO_CANDIDATES', 'PRODUCE_CANDIDATES', ['Stage produced no candidates.'])
    }

    await this.observe(stage, 'TOURNAMENT')
    const champion = await this.ports.tournament.select({
      candidates,
      context,
      acceptanceTests: (output) => this.acceptanceTests(output),
    })
    if (!candidates.some((item) => (
      item.candidateOrdinal === champion.candidateOrdinal
      && item.lineageHash === champion.lineageHash
    ))) {
      fail('INVALID_CHAMPION', 'TOURNAMENT', [
        'Tournament returned a candidate outside the current stage attempt.',
      ])
    }

    await this.observe(stage, 'PREFLIGHT')
    const preflight = await this.preflight(champion.value, {
      measurements: stage.measurements,
      thresholds,
      profile: stage.profile,
    })
    if (!preflight.ok) {
      await this.recordFailure(stage, 'PREFLIGHT', 'PREFLIGHT_FAILED', preflight.failures, [])
      fail('PREFLIGHT_FAILED', 'PREFLIGHT', preflight.failures)
    }
    if (preflight.evidenceHashes.length === 0) {
      const failures = [
        'Successful preflight requires deterministic evidence hashes.',
      ]
      await this.recordFailure(stage, 'PREFLIGHT', 'PREFLIGHT_EVIDENCE_MISSING', failures, [])
      fail('PREFLIGHT_EVIDENCE_MISSING', 'PREFLIGHT', failures)
    }

    const acceptanceTests = this.acceptanceTests(champion.value)
    if (acceptanceTests.length === 0) {
      fail('NO_ACCEPTANCE_TESTS', 'PREFLIGHT', ['Stage output has no acceptance tests.'])
    }

    await this.observe(stage, 'PRODUCE_ARTIFACT')
    const artifact = await this.ports.artifacts.produce({
      stage,
      stageCode: this.stageCode,
      champion,
      preflight,
    })
    await this.issue(stage, runKey, 'PRODUCE_ARTIFACT', 'RUNNING', {
      artifact_id: artifact.artifactId,
      content_hash: artifact.contentHash,
      stage_code: this.stageCode,
    })

    await this.observe(stage, 'READ_BACK_VERIFY')
    const readBack = await this.ports.verification.readBack({
      stage,
      artifact,
      expected: champion.value,
      acceptanceTests,
    })
    if (!readBack.ok) {
      await this.recordFailure(
        stage,
        'READ_BACK_VERIFY',
        'READ_BACK_FAILED',
        readBack.failures,
        readBack.evidenceHashes,
      )
      fail('READ_BACK_FAILED', 'READ_BACK_VERIFY', readBack.failures)
    }
    if (readBack.evidenceHashes.length === 0) {
      const failures = [
        'Successful read-back verification requires evidence hashes.',
      ]
      await this.recordFailure(
        stage,
        'READ_BACK_VERIFY',
        'READ_BACK_EVIDENCE_MISSING',
        failures,
        [],
      )
      fail('READ_BACK_EVIDENCE_MISSING', 'READ_BACK_VERIFY', failures)
    }

    await this.observe(stage, 'VERIFY_ARTIFACT')
    await this.issue(stage, runKey, 'VERIFY_ARTIFACT', 'PRODUCED', {
      artifact_id: artifact.artifactId,
      evidence_hashes: readBack.evidenceHashes,
      stage_code: this.stageCode,
    })

    await this.observe(stage, 'FREEZE_STAGE')
    await this.issue(stage, runKey, 'FREEZE_STAGE', 'VERIFIED', {
      artifact_id: artifact.artifactId,
      stage_code: this.stageCode,
    })
  }

  private async observe(stage: StageRunRecord, step: StageLifecycleStep): Promise<void> {
    await this.ports.observer.onStep({ stage, step })
  }

  private async recordFailure(
    stage: StageRunRecord,
    step: StageLifecycleStep,
    code: StageLifecycleErrorCode,
    failures: readonly string[],
    evidenceHashes: readonly Hex64[],
  ): Promise<void> {
    await this.ports.evidence.recordFailure({ stage, step, code, failures, evidenceHashes })
  }

  private async issue(
    stage: StageRunRecord,
    stageRunKey: Hex64,
    type: StageCommandType,
    prevState: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const command: ExecuteCommand = {
      type,
      packageId: stage.packageId,
      targetId: stage.stageInstanceId,
      idempotencyKey: commandKey(stageRunKey, type),
      fencingToken: stage.fencingToken,
      prevState,
      traceId: stage.traceId,
      actorIdentity: stage.actorIdentity,
      payload,
    }
    const result = await this.ports.commands.execute(command)
    if (!result.ok) {
      fail('COMMAND_REJECTED', this.commandStep(type), [result.reason])
    }
    if (result.nextState !== EXPECTED_STATE[type]) {
      fail('COMMAND_STATE_MISMATCH', this.commandStep(type), [
        `Expected ${EXPECTED_STATE[type]}, received ${result.nextState}.`,
      ])
    }
  }

  private commandStep(type: StageCommandType): StageLifecycleStep {
    if (type === 'START_STAGE') return 'VALIDATE_INPUT'
    if (type === 'PRODUCE_ARTIFACT') return 'PRODUCE_ARTIFACT'
    if (type === 'VERIFY_ARTIFACT') return 'VERIFY_ARTIFACT'
    return 'FREEZE_STAGE'
  }
}
