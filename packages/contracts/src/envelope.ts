import { z } from 'zod'

export const JobEnvelopeSchema = z.object({
  traceId: z.string(),
  packageId: z.string(),
  stageInstanceId: z.string(),
  fencingToken: z.number().int(),
  capabilityId: z.string(),
  settingsHash: z.string().length(64),
  reservationId: z.string(),
  namespace: z.enum(['production', 'qualification', 'staging']),
  imageDigest: z.string(),
  profile: z.enum(['FULL', 'REDUCED']),
  inputs: z.array(z.object({ r2Key: z.string(), sha256: z.string().length(64) })),
  spec: z.unknown(),
  outputs: z.object({ r2Prefix: z.string(), expectedArtifacts: z.array(z.string()) }),
  deadlineAt: z.string().datetime()
})

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>
