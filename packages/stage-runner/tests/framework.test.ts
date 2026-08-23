import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  thresholds,
} from '@youtube-ai-factory/contracts'
import type {
  AcceptanceTest,
  Candidate,
  CapabilityId,
  CapabilityRef,
  ChannelId,
  FencingToken,
  Hex64,
  PackageId,
  PreflightContext,
  PreflightResult,
  RunContext,
  StageInstanceId,
  TraceId,
} from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import type { ExecuteCommand } from '@youtube-ai-factory/core-command'

import { StageLifecycleError, StageRunner } from '../src/index.js'
import type {
  ReadBackResult,
  StageLifecycleStep,
  StageRunRecord,
  StageRunnerPorts,
  StoredArtifact,
} from '../src/index.js'

interface FixtureInput { readonly topic: string }
interface FixtureOutput { readonly script: string }

const STAGE_ID = 'stage-10' as StageInstanceId
const PACKAGE_ID = 'package-10' as PackageId
const CHANNEL_ID = 'channel-10' as ChannelId
const TRACE_ID = 'trace-10' as TraceId
const INPUT: FixtureInput = { topic: 'settlement rails' }
const INPUT_HASH = canonicalHash(INPUT)
const LINEAGE_HASH = canonicalHash({ candidate: 'one' })
const EVIDENCE_HASH = canonicalHash({ evidence: 'preflight' })
const ARTIFACT_HASH = canonicalHash({ artifact: 'champion' })
const CAPABILITY: CapabilityRef = {
  capabilityId: 'script-capability' as CapabilityId,
  version: '1.0.0',
}

function record(overrides: Partial<StageRunRecord> = {}): StageRunRecord {
  return {
    stageInstanceId: STAGE_ID,
    packageId: PACKAGE_ID,
    channelId: CHANNEL_ID,
    traceId: TRACE_ID,
    fencingToken: 11 as FencingToken,
    attemptOrdinal: 1,
    controlState: 'NOT_STARTED',
    profile: 'REDUCED',
    actorIdentity: 'orchestrator',
    input: INPUT,
    inputHash: INPUT_HASH,
    measurements: { values: { duration_seconds: 60 }, evidenceHashes: [EVIDENCE_HASH] },
    ...overrides,
  }
}

function candidate(value: FixtureOutput = { script: 'champion' }): Candidate<FixtureOutput> {
  return { value, candidateOrdinal: 1, lineageHash: LINEAGE_HASH }
}

function fixturePorts(options: {
  readonly stage?: StageRunRecord
  readonly dorReady?: boolean
  readonly foreignChampion?: boolean
  readonly readBack?: ReadBackResult
} = {}): {
  readonly ports: StageRunnerPorts
  readonly steps: StageLifecycleStep[]
  readonly commands: ExecuteCommand[]
  readonly failures: string[]
  readonly counters: { produce: number; artifact: number; readBack: number }
} {
  const steps: StageLifecycleStep[] = []
  const commands: ExecuteCommand[] = []
  const failures: string[] = []
  const counters = { produce: 0, artifact: 0, readBack: 0 }

  return {
    steps,
    commands,
    failures,
    counters,
    ports: {
      repository: { async load() { return options.stage ?? record() } },
      dor: {
        async resolve() {
          return options.dorReady === false
            ? { ready: false, failures: [{ condition: 'LEASE_VALID', expected: 'true', actual: 'false', remediation: 'Acquire lease.' }] }
            : { ready: true }
        },
      },
      tournament: {
        async select(input) {
          const selected = input.candidates.at(0)
          if (selected === undefined) throw new Error('Fixture requires at least one candidate.')
          return options.foreignChampion
            ? { ...selected, lineageHash: canonicalHash({ candidate: 'foreign' }) }
            : selected
        },
      },
      artifacts: {
        async produce() {
          counters.artifact += 1
          return {
            artifactId: 'artifact-10',
            contentHash: ARTIFACT_HASH,
            evidenceHashes: [EVIDENCE_HASH],
          }
        },
      },
      verification: {
        async readBack() {
          counters.readBack += 1
          return options.readBack ?? { ok: true, evidenceHashes: [EVIDENCE_HASH] }
        },
      },
      commands: {
        async execute(command) {
          commands.push(command)
          const states = {
            START_STAGE: 'RUNNING',
            PRODUCE_ARTIFACT: 'PRODUCED',
            VERIFY_ARTIFACT: 'VERIFIED',
            FREEZE_STAGE: 'FROZEN',
          } as const
          return { ok: true, nextState: states[command.type as keyof typeof states] }
        },
      },
      evidence: {
        async recordFailure(input) { failures.push(`${input.step}:${input.code}`) },
      },
      observer: {
        async onStep(input) { steps.push(input.step) },
      },
    },
  }
}

class FixtureRunner extends StageRunner<FixtureInput, FixtureOutput> {
  readonly stageCode = '10'
  readonly seenContexts: RunContext[] = []
  preflightResult: PreflightResult = { ok: true, evidenceHashes: [EVIDENCE_HASH] }
  produceCalls = 0

  requiredCapabilities(): readonly CapabilityRef[] { return [CAPABILITY] }
  inputSchema(): z.ZodType<FixtureInput> { return z.object({ topic: z.string().min(1) }).strict() }
  async produce(_input: FixtureInput, context: RunContext): Promise<readonly Candidate<FixtureOutput>[]> {
    this.produceCalls += 1
    this.seenContexts.push(context)
    return [candidate()]
  }
  async preflight(_candidate: FixtureOutput, context: PreflightContext): Promise<PreflightResult> {
    expect(context.profile).toBe('REDUCED')
    expect(context.thresholds.PROFILE.REDUCED).toBe(thresholds.PROFILE.REDUCED)
    return this.preflightResult
  }
  acceptanceTests(): readonly AcceptanceTest[] {
    return [{ code: 'SCRIPT_NON_EMPTY', description: 'Script must be non-empty.' }]
  }
}

describe('StageRunner framework', () => {
  it('executes the mandatory nine lifecycle phases and reads REDUCED PROFILE', async () => {
    const fixture = fixturePorts()
    const runner = new FixtureRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).resolves.toBeUndefined()

    expect(fixture.steps).toEqual([
      'RESOLVE_DOR',
      'VALIDATE_INPUT',
      'PRODUCE_CANDIDATES',
      'TOURNAMENT',
      'PREFLIGHT',
      'PRODUCE_ARTIFACT',
      'READ_BACK_VERIFY',
      'VERIFY_ARTIFACT',
      'FREEZE_STAGE',
    ])
    expect(fixture.commands.map((command) => command.type)).toEqual([
      'START_STAGE', 'PRODUCE_ARTIFACT', 'VERIFY_ARTIFACT', 'FREEZE_STAGE',
    ])
    expect(runner.seenContexts[0]).toMatchObject({
      profile: 'REDUCED',
      profileSettings: thresholds.PROFILE.REDUCED,
    })
  })

  it('stops at DoR with zero production work and zero command side effects', async () => {
    const fixture = fixturePorts({ dorReady: false })
    const runner = new FixtureRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'DOR_FAILED' })
    expect(fixture.steps).toEqual(['RESOLVE_DOR'])
    expect(runner.produceCalls).toBe(0)
    expect(fixture.commands).toHaveLength(0)
    expect(fixture.counters.artifact).toBe(0)
  })

  it('rejects schema defaults that would mutate canonical input identity', async () => {
    class DefaultingRunner extends FixtureRunner {
      override inputSchema(): z.ZodType<FixtureInput> {
        return z.object({ topic: z.string().default('invented') })
      }
    }
    const emptyInput = {}
    const fixture = fixturePorts({ stage: record({ input: emptyInput, inputHash: canonicalHash(emptyInput) }) })
    const runner = new DefaultingRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'INPUT_IDENTITY_MISMATCH' })
    expect(fixture.commands).toHaveLength(0)
    expect(runner.produceCalls).toBe(0)
  })

  it('records deterministic preflight failure without sealing or producing a second revision', async () => {
    const fixture = fixturePorts()
    const runner = new FixtureRunner(fixture.ports)
    runner.preflightResult = { ok: false, failures: ['duration mismatch'] }

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'PREFLIGHT_FAILED' })
    expect(runner.produceCalls).toBe(1)
    expect(fixture.counters.artifact).toBe(0)
    expect(fixture.failures).toEqual(['PREFLIGHT:PREFLIGHT_FAILED'])
    expect(fixture.commands.map((command) => command.type)).toEqual(['START_STAGE'])
  })

  it('blocks VERIFY_ARTIFACT and FREEZE_STAGE when read-back verification fails', async () => {
    const fixture = fixturePorts({ readBack: { ok: false, failures: ['checksum mismatch'], evidenceHashes: [EVIDENCE_HASH] } })
    const runner = new FixtureRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'READ_BACK_FAILED' })
    expect(fixture.commands.map((command) => command.type)).toEqual(['START_STAGE', 'PRODUCE_ARTIFACT'])
    expect(fixture.failures).toEqual(['READ_BACK_VERIFY:READ_BACK_FAILED'])
  })

  it('treats missing read-back evidence as a recorded fail-closed result', async () => {
    const fixture = fixturePorts({ readBack: { ok: true, evidenceHashes: [] } })
    const runner = new FixtureRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'READ_BACK_EVIDENCE_MISSING' })
    expect(fixture.commands.map((command) => command.type)).toEqual(['START_STAGE', 'PRODUCE_ARTIFACT'])
    expect(fixture.failures).toEqual(['READ_BACK_VERIFY:READ_BACK_EVIDENCE_MISSING'])
  })

  it('rejects a tournament result that was not produced by this attempt', async () => {
    const fixture = fixturePorts({ foreignChampion: true })
    const runner = new FixtureRunner(fixture.ports)

    await expect(runner.run(STAGE_ID)).rejects.toMatchObject({ code: 'INVALID_CHAMPION' })
    expect(fixture.counters.artifact).toBe(0)
    expect(fixture.commands.map((command) => command.type)).toEqual(['START_STAGE'])
  })

  it('derives identical command idempotency keys for the same attempt', async () => {
    const first = fixturePorts()
    const second = fixturePorts()
    await new FixtureRunner(first.ports).run(STAGE_ID)
    await new FixtureRunner(second.ports).run(STAGE_ID)

    expect(first.commands.map((command) => command.idempotencyKey))
      .toEqual(second.commands.map((command) => command.idempotencyKey))
    expect(new Set(first.commands.map((command) => command.idempotencyKey)).size).toBe(4)
  })
})

it('keeps stored artifact references evidence-bound', () => {
  const artifact: StoredArtifact = {
    artifactId: 'artifact-10',
    contentHash: ARTIFACT_HASH,
    evidenceHashes: [EVIDENCE_HASH],
  }
  expect(artifact.evidenceHashes).toHaveLength(1)
})
