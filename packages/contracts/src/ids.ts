declare const brand: unique symbol

export type Brand<T, B> = T & { readonly [brand]: B }

export type ChannelId = Brand<string, 'ChannelId'>
export type EpisodeId = Brand<string, 'EpisodeId'>
export type PackageId = Brand<string, 'PackageId'>
export type StageInstanceId = Brand<string, 'StageInstanceId'>
export type ArtifactId = Brand<string, 'ArtifactId'>
export type CapabilityId = Brand<string, 'CapabilityId'>
export type ArchetypeId = Brand<string, 'ArchetypeId'>
export type ClaimId = Brand<string, 'ClaimId'>
export type ShotId = Brand<string, 'ShotId'>
export type MasterId = Brand<string, 'MasterId'>
export type ReservationId = Brand<string, 'ReservationId'>
export type LearningId = Brand<string, 'LearningId'>
export type ProposalId = Brand<string, 'ProposalId'>
export type GoldSampleId = Brand<string, 'GoldSampleId'>
export type IncidentId = Brand<string, 'IncidentId'>
export type HumanActorId = Brand<string, 'HumanActorId'>
export type Hex64 = Brand<string, 'Hex64'>
export type FencingToken = Brand<number, 'FencingToken'>
export type R2Key = Brand<string, 'R2Key'>
export type TraceId = Brand<string, 'TraceId'>
