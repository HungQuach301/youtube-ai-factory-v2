import { describe, expect, it } from 'vitest'

import type {
  ArchetypeId,
  ChannelId,
  PackageId,
  R2Key,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import type {
  DoRCondition,
  DoREvidenceRepository,
  DoREvidenceSnapshot,
  DoRRequest,
} from '../src/index.js'
import { DOR_CONDITIONS, DoRResolver } from '../src/index.js'

const ARCHETYPE = 'documentary-live-action' as ArchetypeId
const REQUEST: DoRRequest = {
  stageInstanceId: 'stage-instance' as StageInstanceId,
  packageId: 'package' as PackageId,
  channelId: 'channel' as ChannelId,
  stageOrdinal: thresholds.DOR.HUMAN_DECISION_STAGE_ORDINAL,
  requiredStandardVersion: 3,
  estimatedCostUsd: 5,
  requiredCapabilities: [{
    capabilityCode: 'truth-review',
    requiredArchetypes: [ARCHETYPE],
    expectedSettingsHash: 'settings-v1',
  }],
}

function passingSnapshot(): DoREvidenceSnapshot {
  return {
    leaseValid: true,
    parents: [{
      artifactId: 'parent-1',
      immutabilityState: 'SEALED',
      eligibilityState: 'ELIGIBLE_FOR_STAGE',
      standardVersion: REQUEST.requiredStandardVersion,
    }],
    gates: [{
      gateCode: 'FACTUAL_SAFETY',
      tier: 'M0',
      state: 'PASS',
      evidenceR2Key: 'evidence/gate.json' as R2Key,
    }],
    capabilities: [{
      capabilityCode: 'truth-review',
      qualified: true,
      qualifiedArchetypes: [ARCHETYPE],
      settingsHash: 'settings-v1',
    }],
    activeProviderRequestCount: 0,
    unreconciledExpiredLeaseCount: 0,
    availableBudgetUsd: REQUEST.estimatedCostUsd,
    quarantinedInputHashes: [],
    conflictingProviderRequestCount: 0,
    channelFrozen: false,
    humanDecisionCount: thresholds.POLICY.MIN_HUMAN_DECISIONS,
  }
}

class MemoryEvidenceRepository implements DoREvidenceRepository {
  readCount = 0

  constructor(private readonly snapshot: DoREvidenceSnapshot) {}

  loadEvidence(): DoREvidenceSnapshot {
    this.readCount += 1
    return this.snapshot
  }
}

async function resolve(snapshot: DoREvidenceSnapshot, request = REQUEST) {
  return new DoRResolver(new MemoryEvidenceRepository(snapshot)).resolve(request)
}

function failureConditions(result: Awaited<ReturnType<typeof resolve>>): readonly DoRCondition[] {
  return result.ready ? [] : result.failures.map((failure) => failure.condition as DoRCondition)
}

describe('DoRResolver', () => {
  it('resolves all eleven conditions from fresh evidence', async () => {
    const repository = new MemoryEvidenceRepository(passingSnapshot())
    const result = await new DoRResolver(repository).resolve(REQUEST)

    expect(DOR_CONDITIONS).toHaveLength(thresholds.DOR.CONDITION_COUNT)
    expect(new Set(DOR_CONDITIONS).size).toBe(thresholds.DOR.CONDITION_COUNT)
    expect(result).toEqual({ ready: true })
    expect(repository.readCount).toBe(1)
  })

  it.each<readonly [DoRCondition, (snapshot: DoREvidenceSnapshot) => void]>([
    ['LEASE_VALID', (snapshot) => { snapshot.leaseValid = false }],
    ['PARENTS_READY', (snapshot) => { snapshot.parents[0]!.immutabilityState = 'DRAFT' }],
    ['MANDATORY_GATES_PASS', (snapshot) => { snapshot.gates[0]!.state = 'FAIL' }],
    ['CAPABILITIES_QUALIFIED', (snapshot) => { snapshot.capabilities[0]!.qualified = false }],
    ['NO_ACTIVE_PROVIDER_REQUESTS', (snapshot) => { snapshot.activeProviderRequestCount = 1 }],
    ['NO_UNRECONCILED_LEASES', (snapshot) => { snapshot.unreconciledExpiredLeaseCount = 1 }],
    ['BUDGET_AVAILABLE', (snapshot) => { snapshot.availableBudgetUsd = REQUEST.estimatedCostUsd - 1 }],
    ['INPUTS_NOT_QUARANTINED', (snapshot) => { snapshot.quarantinedInputHashes = ['hash-1'] }],
    ['NO_CONFLICTING_PROVIDER_REQUESTS', (snapshot) => { snapshot.conflictingProviderRequestCount = 1 }],
    ['CHANNEL_NOT_FROZEN', (snapshot) => { snapshot.channelFrozen = true }],
    ['HUMAN_DECISIONS_SUFFICIENT', (snapshot) => {
      snapshot.humanDecisionCount = thresholds.POLICY.MIN_HUMAN_DECISIONS - 1
    }],
  ])('fails closed when %s is not satisfied', async (condition, mutate) => {
    const snapshot = passingSnapshot()
    mutate(snapshot)

    expect(failureConditions(await resolve(snapshot))).toContain(condition)
  })

  it('rejects NOT_EVALUATED at M0 and preserves the actual state', async () => {
    const snapshot = passingSnapshot()
    snapshot.gates[0]!.state = 'NOT_EVALUATED'

    const result = await resolve(snapshot)

    expect(result.ready).toBe(false)
    if (result.ready) throw new Error('expected DoR rejection')
    expect(result.failures).toContainEqual(expect.objectContaining({
      condition: 'MANDATORY_GATES_PASS',
      actual: expect.stringContaining('NOT_EVALUATED'),
    }))
  })

  it('requires PASS at M1 while leaving M2 outside the readiness boundary', async () => {
    const snapshot = passingSnapshot()
    snapshot.gates.push({
      gateCode: 'EDITORIAL_REVIEW',
      tier: 'M1',
      state: 'NOT_EVALUATED',
      evidenceR2Key: null,
    })
    expect(failureConditions(await resolve(snapshot))).toContain('MANDATORY_GATES_PASS')

    snapshot.gates[1]!.tier = 'M2'
    await expect(resolve(snapshot)).resolves.toEqual({ ready: true })
  })

  it('blocks a frozen channel', async () => {
    const snapshot = passingSnapshot()
    snapshot.channelFrozen = true

    expect(failureConditions(await resolve(snapshot))).toContain('CHANNEL_NOT_FROZEN')
  })

  it('requires human decisions only from Stage 14 onward', async () => {
    const snapshot = passingSnapshot()
    snapshot.humanDecisionCount = 0

    const beforeStage14 = { ...REQUEST, stageOrdinal: thresholds.DOR.HUMAN_DECISION_STAGE_ORDINAL - 1 }
    await expect(resolve(snapshot, beforeStage14)).resolves.toEqual({ ready: true })
    expect(failureConditions(await resolve(snapshot))).toContain('HUMAN_DECISIONS_SUFFICIENT')
  })

  it('treats unknown evidence as failure and returns structured remediation', async () => {
    const snapshot = passingSnapshot()
    snapshot.leaseValid = null
    snapshot.availableBudgetUsd = null
    snapshot.channelFrozen = null

    const result = await resolve(snapshot)

    expect(result.ready).toBe(false)
    if (result.ready) throw new Error('expected DoR rejection')
    expect(result.failures).toHaveLength(3)
    for (const failure of result.failures) {
      expect(failure.condition).not.toHaveLength(0)
      expect(failure.expected).not.toHaveLength(0)
      expect(failure.actual).not.toHaveLength(0)
      expect(failure.remediation).not.toHaveLength(0)
    }
  })

  it('rejects a PASS gate that lacks evidence', async () => {
    const snapshot = passingSnapshot()
    snapshot.gates[0]!.evidenceR2Key = null

    expect(failureConditions(await resolve(snapshot))).toContain('MANDATORY_GATES_PASS')
  })

  it('rejects capability settings drift and incomplete archetype qualification', async () => {
    const settingsDrift = passingSnapshot()
    settingsDrift.capabilities[0]!.settingsHash = 'settings-v2'
    expect(failureConditions(await resolve(settingsDrift))).toContain('CAPABILITIES_QUALIFIED')

    const missingArchetype = passingSnapshot()
    missingArchetype.capabilities[0]!.qualifiedArchetypes = []
    expect(failureConditions(await resolve(missingArchetype))).toContain('CAPABILITIES_QUALIFIED')
  })

  it('fails every condition when the evidence query is unavailable', async () => {
    const repository: DoREvidenceRepository = {
      loadEvidence: () => { throw new Error('D1 unavailable') },
    }
    const result = await new DoRResolver(repository).resolve(REQUEST)

    expect(result.ready).toBe(false)
    if (result.ready) throw new Error('expected DoR rejection')
    expect(result.failures).toHaveLength(thresholds.DOR.CONDITION_COUNT)
    expect(result.failures.every((item) => item.actual === 'EVIDENCE_QUERY_FAILED')).toBe(true)
  })

  it('exposes no provider client through the evidence repository boundary', () => {
    type HasProviderClient = 'providerClient' extends keyof DoREvidenceRepository ? true : false
    const hasProviderClient: HasProviderClient = false

    expect(hasProviderClient).toBe(false)
  })

  it('recomputes from the repository on every request instead of trusting a ready flag', async () => {
    const snapshot = passingSnapshot()
    const repository = new MemoryEvidenceRepository(snapshot)
    const resolver = new DoRResolver(repository)

    await expect(resolver.resolve(REQUEST)).resolves.toEqual({ ready: true })
    snapshot.channelFrozen = true
    expect(failureConditions(await resolver.resolve(REQUEST))).toContain('CHANNEL_NOT_FROZEN')
    expect(repository.readCount).toBe(2)
  })
})
