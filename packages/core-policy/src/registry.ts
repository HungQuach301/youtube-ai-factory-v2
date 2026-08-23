import type { StrictnessDirection } from '@youtube-ai-factory/contracts'

import type {
  EvolutionAuthorization,
  GateEvaluationInput,
  RegistryChange,
  ResolvedStandard,
  StandardDrift,
  StandardLayer,
  StandardPolicyErrorCode,
  StandardRule,
  StandardScope,
} from './types.js'

const SCOPE_ORDER: Readonly<Record<StandardScope, number>> = {
  PORTFOLIO: 0,
  CHANNEL: 1,
  PILLAR: 2,
  EPISODE: 3,
}

export class StandardPolicyError extends Error {
  override readonly name = 'StandardPolicyError'

  constructor(
    readonly code: StandardPolicyErrorCode,
    message: string,
  ) {
    super(message)
  }
}

function sameAllowlist(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

export function classifyRuleChange(
  before: StandardRule | undefined,
  after: StandardRule | undefined,
): StrictnessDirection {
  if (before === undefined) return after === undefined ? 'NEUTRAL' : 'TIGHTEN'
  if (after === undefined) return 'RELAX'
  if (before.kind !== after.kind) return 'RELAX'

  switch (before.kind) {
    case 'MINIMUM': {
      const candidate = after as Extract<StandardRule, { kind: 'MINIMUM' }>
      if (candidate.value === before.value) return 'NEUTRAL'
      return candidate.value > before.value ? 'TIGHTEN' : 'RELAX'
    }
    case 'MAXIMUM': {
      const candidate = after as Extract<StandardRule, { kind: 'MAXIMUM' }>
      if (candidate.value === before.value) return 'NEUTRAL'
      return candidate.value < before.value ? 'TIGHTEN' : 'RELAX'
    }
    case 'REQUIRED': {
      const candidate = after as Extract<StandardRule, { kind: 'REQUIRED' }>
      if (candidate.value === before.value) return 'NEUTRAL'
      return candidate.value ? 'TIGHTEN' : 'RELAX'
    }
    case 'ALLOWLIST': {
      const candidate = after as Extract<StandardRule, { kind: 'ALLOWLIST' }>
      if (sameAllowlist(before.values, candidate.values)) return 'NEUTRAL'
      return candidate.values.every((value) => before.values.includes(value))
        ? 'TIGHTEN'
        : 'RELAX'
    }
  }
}

function hasPromotionEvidence(authorization: EvolutionAuthorization | undefined): boolean {
  return authorization?.status === 'PROMOTED'
    && authorization.ownerIdentity.trim().length > 0
    && authorization.evidenceR2Key.trim().length > 0
}

export function applyRegistryChange(
  before: StandardRule | undefined,
  after: StandardRule | undefined,
  authorization?: EvolutionAuthorization,
): RegistryChange {
  const direction = classifyRuleChange(before, after)
  if (direction === 'RELAX' && !hasPromotionEvidence(authorization)) {
    throw new StandardPolicyError(
      'RELAX_REQUIRES_PROMOTION',
      'G11: RELAX requires a promoted, owner-signed evolution with evidence.',
    )
  }
  return { direction, rule: after }
}

function copyRule(rule: StandardRule): StandardRule {
  return rule.kind === 'ALLOWLIST' ? { ...rule, values: [...rule.values] } : { ...rule }
}

function validateLayerOrder(layers: readonly StandardLayer[]): void {
  let previous = -1
  const seen = new Set<StandardScope>()
  for (const layer of layers) {
    const current = SCOPE_ORDER[layer.scope]
    if (current <= previous || seen.has(layer.scope)) {
      throw new StandardPolicyError(
        'INVALID_SCOPE_ORDER',
        'Standards must follow PORTFOLIO → CHANNEL → PILLAR → EPISODE without duplicates.',
      )
    }
    if (!Number.isSafeInteger(layer.version) || layer.version < 1) {
      throw new StandardPolicyError(
        'INVALID_STANDARD_VERSION',
        'Standard versions must be positive safe integers.',
      )
    }
    seen.add(layer.scope)
    previous = current
  }
}

export function resolveStandard(layers: readonly StandardLayer[]): ResolvedStandard {
  validateLayerOrder(layers)
  const rules: Record<string, StandardRule> = {}

  for (const layer of layers) {
    for (const [code, candidate] of Object.entries(layer.rules)) {
      const inherited = rules[code]
      if (inherited !== undefined && classifyRuleChange(inherited, candidate) === 'RELAX') {
        throw new StandardPolicyError(
          'CHILD_STANDARD_RELAXATION',
          `Child scope ${layer.scope} cannot relax inherited rule ${code}.`,
        )
      }
      rules[code] = copyRule(candidate)
    }
  }

  return { rules, lineage: [...layers] }
}

function isFuture(expiry: string, evaluatedAt: string): boolean {
  const expiryMs = Date.parse(expiry)
  const evaluatedMs = Date.parse(evaluatedAt)
  return Number.isFinite(expiryMs) && Number.isFinite(evaluatedMs) && expiryMs > evaluatedMs
}

export function validateGateEvaluation(input: GateEvaluationInput): { readonly valid: true } {
  if (input.state === 'WAIVED') {
    if (input.tier === 'M0') {
      throw new StandardPolicyError('M0_WAIVER_FORBIDDEN', 'P2: M0 gates cannot be WAIVED.')
    }
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString()
    if (input.ownerActive !== true
      || input.waiverOwner?.trim().length === 0
      || input.waiverOwner === undefined
      || input.waiverExpiresAt === undefined
      || !isFuture(input.waiverExpiresAt, evaluatedAt)) {
      throw new StandardPolicyError(
        'WAIVER_AUTHORIZATION_REQUIRED',
        'WAIVED M1/M2 gates require an active owner and a future expiry.',
      )
    }
  }

  if (input.tier === 'M2'
    && input.prerequisiteStates?.some((state) => state !== 'PASS')) {
    throw new StandardPolicyError(
      'M2_PREREQUISITES_NOT_CLEAN',
      'M2 cannot be evaluated until every M0 and M1 prerequisite is PASS.',
    )
  }

  return { valid: true }
}

export function detectStandardDrift(
  versions: readonly number[],
  maxAllowedVersionSpread: number | null,
): StandardDrift | null {
  if (maxAllowedVersionSpread !== null
    && (!Number.isSafeInteger(maxAllowedVersionSpread) || maxAllowedVersionSpread < 0)) {
    throw new StandardPolicyError(
      'INVALID_DRIFT_THRESHOLD',
      'Standard drift threshold must be a non-negative safe integer or UNDECIDED.',
    )
  }

  if (versions.length === 0 || maxAllowedVersionSpread === null) {
    return {
      code: 'STANDARD_DRIFT',
      minVersion: versions.length === 0 ? null : Math.min(...versions),
      maxVersion: versions.length === 0 ? null : Math.max(...versions),
      spread: versions.length === 0 ? null : Math.max(...versions) - Math.min(...versions),
      threshold: 'UNDECIDED',
      blocksFreeze: true,
    }
  }

  const minVersion = Math.min(...versions)
  const maxVersion = Math.max(...versions)
  const spread = maxVersion - minVersion
  return spread > maxAllowedVersionSpread
    ? {
        code: 'STANDARD_DRIFT', minVersion, maxVersion, spread,
        threshold: maxAllowedVersionSpread, blocksFreeze: true,
      }
    : null
}
