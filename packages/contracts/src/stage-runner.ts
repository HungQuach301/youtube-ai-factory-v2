import type { z } from 'zod'

import type { AcceptanceTest, Candidate, CapabilityRef, DeterministicMeasurements, PreflightResult, RunContext } from './artifacts.js'
import type { ProfileName } from './enums.js'
import type { StageInstanceId } from './ids.js'
import type * as thresholds from './thresholds.js'

export interface PreflightContext {
  readonly measurements: DeterministicMeasurements
  readonly thresholds: typeof thresholds
  readonly profile: ProfileName
}

export abstract class StageRunner<In, Out> {
  abstract readonly stageCode: string
  abstract requiredCapabilities(): readonly CapabilityRef[]
  abstract inputSchema(): z.ZodType<In>
  abstract produce(input: In, context: RunContext): Promise<readonly Candidate<Out>[]>
  abstract preflight(candidate: Out, context: PreflightContext): Promise<PreflightResult>
  abstract acceptanceTests(output: Out): readonly AcceptanceTest[]

  /** @final Implemented by the EXE-02 framework in WP-10. */
  abstract run(id: StageInstanceId): Promise<void>
}
