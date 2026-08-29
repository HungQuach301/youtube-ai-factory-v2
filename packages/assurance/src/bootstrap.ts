import type { AssuranceRunResult } from './types.js'

const BOOTSTRAP_WARNING_PREFIXES = Object.freeze([
  'RUBRIC_ANCHOR_MISSING:',
  'CRITIC_NOT_QUALIFIED:',
] as const)

const BOOTSTRAP_WARNING_EXACT = new Set([
  'RUBRIC_ANCHORS_INCOMPLETE',
  'M2_WARNING_ONLY_NOT_A_RELEASE_GATE',
])

function isBootstrapWarning(value: string): boolean {
  return BOOTSTRAP_WARNING_EXACT.has(value)
    || BOOTSTRAP_WARNING_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export interface AssuranceLaneResolution {
  readonly qualificationLaneEligible: boolean
  readonly releaseEligible: boolean
  readonly warnings: readonly string[]
  readonly hardBlockers: readonly string[]
}

/**
 * Resolves Track G bootstrap eligibility without weakening the Production M2 gate.
 *
 * Missing anchors or unqualified critics may be warnings only when the run is
 * explicitly WARNING_ONLY and no provider was dispatched. The same evidence is
 * a hard blocker in HARD_GATE mode. Unknown blockers always remain hard blockers.
 */
export function resolveAssuranceLaneEligibility(
  result: AssuranceRunResult,
): AssuranceLaneResolution {
  const hardGatePassed = result.mode === 'HARD_GATE'
    && result.gateState === 'PASS'
    && result.verdict === 'PASS'
    && result.blockers.length === 0
  if (hardGatePassed) {
    return {
      qualificationLaneEligible: true,
      releaseEligible: true,
      warnings: [],
      hardBlockers: [],
    }
  }

  const bootstrapWarning = result.mode === 'WARNING_ONLY'
    && result.gateState === 'NOT_EVALUATED'
    && result.verdict === 'NOT_RUN'
    && result.providerCallCount === 0
    && result.blockers.length > 0
    && result.blockers.every(isBootstrapWarning)
  const evaluatedWarning = result.mode === 'WARNING_ONLY'
    && result.gateState === 'NOT_EVALUATED'
    && (result.verdict === 'PASS' || result.verdict === 'FAIL')
    && result.blockers.every(isBootstrapWarning)
  if (bootstrapWarning || evaluatedWarning) {
    return {
      qualificationLaneEligible: true,
      releaseEligible: false,
      warnings: [...result.blockers],
      hardBlockers: [],
    }
  }

  const hardBlockers = result.blockers.length > 0
    ? [...result.blockers]
    : [result.mode === 'HARD_GATE' ? 'M2_HARD_GATE_NOT_PASSED' : 'M2_WARNING_RESULT_UNSAFE']
  return {
    qualificationLaneEligible: false,
    releaseEligible: false,
    warnings: [],
    hardBlockers,
  }
}
