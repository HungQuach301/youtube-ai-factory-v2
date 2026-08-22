import type { PolicyCheckCode } from './enums.js'
import type { PackageId, R2Key } from './ids.js'

export interface PolicyCheckResult {
  readonly code: PolicyCheckCode
  readonly state: 'PASS' | 'FAIL' | 'NOT_EVALUATED'
  readonly evidenceR2Key: R2Key | null
  readonly detail: Readonly<Record<string, unknown>>
}

export declare function policyDefenseChecklist(packageId: PackageId): Promise<readonly PolicyCheckResult[]>
