import type { DoRFailure, DoRResult } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import type {
  CapabilityEvidence,
  CapabilityRequirement,
  DoRCondition,
  DoREvidenceRepository,
  DoREvidenceSnapshot,
  DoRRequest,
  GateEvidence,
  ParentEvidence,
} from './types.js'

const NO_ITEMS = 0

export const DOR_CONDITIONS = [
  'LEASE_VALID',
  'PARENTS_READY',
  'MANDATORY_GATES_PASS',
  'CAPABILITIES_QUALIFIED',
  'NO_ACTIVE_PROVIDER_REQUESTS',
  'NO_UNRECONCILED_LEASES',
  'BUDGET_AVAILABLE',
  'INPUTS_NOT_QUARANTINED',
  'NO_CONFLICTING_PROVIDER_REQUESTS',
  'CHANNEL_NOT_FROZEN',
  'HUMAN_DECISIONS_SUFFICIENT',
] as const satisfies readonly DoRCondition[]

function failure(
  condition: DoRCondition,
  expected: string,
  actual: string,
  remediation: string,
): DoRFailure {
  return { condition, expected, actual, remediation }
}

function valueOrUnknown(value: number | boolean | null): string {
  return value === null ? 'UNKNOWN' : String(value)
}

function parentsReady(parents: readonly ParentEvidence[], requiredVersion: number): boolean {
  return parents.every((parent) => (
    parent.immutabilityState === 'SEALED'
    && parent.eligibilityState !== 'INELIGIBLE'
    && parent.standardVersion >= requiredVersion
  ))
}

function mandatoryGateFailures(gates: readonly GateEvidence[]): readonly GateEvidence[] {
  return gates.filter((gate) => (
    (gate.tier === 'M0' || gate.tier === 'M1')
    && (gate.state !== 'PASS' || gate.evidenceR2Key === null)
  ))
}

function capabilityMatches(
  requirement: CapabilityRequirement,
  evidence: CapabilityEvidence | undefined,
): boolean {
  return evidence !== undefined
    && evidence.qualified
    && evidence.settingsHash === requirement.expectedSettingsHash
    && requirement.requiredArchetypes.every((archetype) => (
      evidence.qualifiedArchetypes.includes(archetype)
    ))
}

function capabilityFailures(
  requirements: readonly CapabilityRequirement[],
  evidence: readonly CapabilityEvidence[],
): readonly string[] {
  return requirements
    .filter((requirement) => !capabilityMatches(
      requirement,
      evidence.find((item) => item.capabilityCode === requirement.capabilityCode),
    ))
    .map((requirement) => requirement.capabilityCode)
}

export class DoRResolver {
  constructor(private readonly repository: DoREvidenceRepository) {}

  async resolve(request: DoRRequest): Promise<DoRResult> {
    let snapshot: DoREvidenceSnapshot
    try {
      snapshot = await this.repository.loadEvidence(request)
    } catch {
      return {
        ready: false,
        failures: DOR_CONDITIONS.map((condition) => failure(
          condition,
          'verifiable evidence',
          'EVIDENCE_QUERY_FAILED',
          'Restore the evidence query and evaluate DoR again.',
        )),
      }
    }

    const failures = this.evaluate(request, snapshot)
    return failures.length === NO_ITEMS ? { ready: true } : { ready: false, failures }
  }

  private evaluate(request: DoRRequest, snapshot: DoREvidenceSnapshot): DoRFailure[] {
    const failures: DoRFailure[] = []

    if (snapshot.leaseValid !== true) {
      failures.push(failure(
        'LEASE_VALID', 'true', valueOrUnknown(snapshot.leaseValid),
        'Acquire or reconcile an active lease before starting the stage.',
      ))
    }

    if (!parentsReady(snapshot.parents, request.requiredStandardVersion)) {
      const invalidParents = snapshot.parents
        .filter((parent) => !parentsReady([parent], request.requiredStandardVersion))
        .map((parent) => parent.artifactId)
      failures.push(failure(
        'PARENTS_READY',
        `SEALED, eligible and standard_version >= ${request.requiredStandardVersion}`,
        invalidParents.join(', ') || 'UNKNOWN',
        'Seal, qualify and migrate every parent artifact to the required standard.',
      ))
    }

    const invalidGates = mandatoryGateFailures(snapshot.gates)
    if (invalidGates.length > NO_ITEMS) {
      failures.push(failure(
        'MANDATORY_GATES_PASS',
        'M0/M1 state PASS with evidence',
        invalidGates.map((gate) => `${gate.gateCode}:${gate.state}`).join(', '),
        'Evaluate each mandatory gate and attach reproducible evidence.',
      ))
    }

    const invalidCapabilities = capabilityFailures(
      request.requiredCapabilities,
      snapshot.capabilities,
    )
    if (invalidCapabilities.length > NO_ITEMS) {
      failures.push(failure(
        'CAPABILITIES_QUALIFIED',
        'qualified for every archetype with the registered settings hash',
        invalidCapabilities.join(', '),
        'Qualify or rebind the listed capabilities before retrying.',
      ))
    }

    if (snapshot.activeProviderRequestCount !== NO_ITEMS) {
      failures.push(failure(
        'NO_ACTIVE_PROVIDER_REQUESTS', '0', valueOrUnknown(snapshot.activeProviderRequestCount),
        'Wait for or reconcile every active provider request.',
      ))
    }

    if (snapshot.unreconciledExpiredLeaseCount !== NO_ITEMS) {
      failures.push(failure(
        'NO_UNRECONCILED_LEASES', '0', valueOrUnknown(snapshot.unreconciledExpiredLeaseCount),
        'Complete lease reconciliation before starting new work.',
      ))
    }

    if (snapshot.availableBudgetUsd === null
      || snapshot.availableBudgetUsd < request.estimatedCostUsd) {
      failures.push(failure(
        'BUDGET_AVAILABLE',
        `>= ${request.estimatedCostUsd}`,
        valueOrUnknown(snapshot.availableBudgetUsd),
        'Increase available budget or lower the approved stage estimate.',
      ))
    }

    if (snapshot.quarantinedInputHashes === null
      || snapshot.quarantinedInputHashes.length > NO_ITEMS) {
      failures.push(failure(
        'INPUTS_NOT_QUARANTINED',
        'no quarantined input hashes',
        snapshot.quarantinedInputHashes?.join(', ') ?? 'UNKNOWN',
        'Replace or explicitly clear every quarantined input through governance.',
      ))
    }

    if (snapshot.conflictingProviderRequestCount !== NO_ITEMS) {
      failures.push(failure(
        'NO_CONFLICTING_PROVIDER_REQUESTS',
        '0',
        valueOrUnknown(snapshot.conflictingProviderRequestCount),
        'Resolve provider requests that conflict with this stage.',
      ))
    }

    if (snapshot.channelFrozen !== false) {
      failures.push(failure(
        'CHANNEL_NOT_FROZEN', 'false', valueOrUnknown(snapshot.channelFrozen),
        'Keep production stopped until an authorized UNFREEZE_CHANNEL command succeeds.',
      ))
    }

    const requiresHumanDecisions = request.stageOrdinal
      >= thresholds.DOR.HUMAN_DECISION_STAGE_ORDINAL
    if (requiresHumanDecisions && (
      snapshot.humanDecisionCount === null
      || snapshot.humanDecisionCount < thresholds.POLICY.MIN_HUMAN_DECISIONS
    )) {
      failures.push(failure(
        'HUMAN_DECISIONS_SUFFICIENT',
        `>= ${thresholds.POLICY.MIN_HUMAN_DECISIONS} from Stage ${thresholds.DOR.HUMAN_DECISION_STAGE_ORDINAL}`,
        valueOrUnknown(snapshot.humanDecisionCount),
        'Collect the required identity-bound human decisions before Stage 14.',
      ))
    }

    return failures
  }
}
