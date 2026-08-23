import { thresholds } from '@youtube-ai-factory/contracts'

import { PackagingContractSchema, type LintResult, type PackagingContract } from './types.js'

export function lintPackagingAgainstScript(
  packagingInput: unknown,
  scriptClaimIds: readonly string[],
  titleCosinesToReference: readonly number[],
): LintResult {
  const packaging: PackagingContract = PackagingContractSchema.parse(packagingInput)
  const failures: string[] = []
  const scriptClaims = new Set(scriptClaimIds)
  for (const claimId of packaging.viewerPromiseClaimIds) {
    if (!scriptClaims.has(claimId)) failures.push(`VIEWER_PROMISE_CLAIM_MISSING:${claimId}`)
  }
  for (const [index, cosine] of titleCosinesToReference.entries()) {
    if (!Number.isFinite(cosine) || cosine < -1 || cosine > 1) {
      failures.push(`TITLE_COSINE_INVALID:${index}`)
    } else if (cosine > thresholds.ANTICOPY.TITLE_COSINE_MAX) {
      failures.push(`TITLE_ANTICOPY_FAILED:${index}:${cosine}`)
    }
  }
  return { valid: failures.length === 0, failures }
}
