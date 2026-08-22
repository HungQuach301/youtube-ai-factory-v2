import type { HumanDecisionType, Touchpoint } from './enums.js'
import type { ArtifactId, HumanActorId, PackageId, R2Key } from './ids.js'

export interface HumanDecision {
  readonly id: string
  readonly packageId: PackageId
  readonly decisionType: HumanDecisionType
  readonly actorIdentity: HumanActorId
  readonly artifactBeforeId: ArtifactId | null
  readonly artifactAfterId: ArtifactId | null
  readonly diffR2Key: R2Key | null
  readonly rationaleText: string
  readonly createdAt: string
}

export interface HumanTouchpoint {
  readonly code: Touchpoint
  readonly required: boolean
}
