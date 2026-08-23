import { thresholds, type ProfileName } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import { CreativeError } from './errors.js'
import {
  CreativeRouteSchema,
  PackagingContractSchema,
  type CreativeRoute,
  type LintResult,
} from './types.js'

const RejectedRouteSchema = z.object({
  routeId: z.string().min(1),
  reason: z.string().min(1),
}).strict()

const CreativeContractInputSchema = z.object({
  profile: z.enum(['FULL', 'REDUCED']),
  routes: z.array(CreativeRouteSchema),
  championRouteId: z.string().min(1),
  championScore: z.number().finite(),
  rejectedRoutes: z.array(RejectedRouteSchema),
  packaging: PackagingContractSchema,
}).strict()

export interface Stage04TournamentSettings {
  readonly routeCount: number
  readonly criticCount: number
  readonly championMinScore: number
}

export function stage04TournamentSettings(profile: ProfileName): Stage04TournamentSettings {
  return {
    routeCount: thresholds.PROFILE[profile].routeCount,
    criticCount: thresholds.PROFILE[profile].criticCountStage04,
    championMinScore: thresholds.CREATIVE.CHAMPION_MIN_SCORE,
  }
}

export function lintRouteDiversity(
  routeInputs: readonly unknown[],
  profile: ProfileName,
): LintResult {
  const routes = routeInputs.map((route) => CreativeRouteSchema.parse(route))
  const failures: string[] = []
  const expectedCount = stage04TournamentSettings(profile).routeCount
  if (routes.length !== expectedCount) {
    failures.push(`PROFILE_ROUTE_COUNT:${profile}:expected=${expectedCount}:actual=${routes.length}`)
  }
  const seenIds = new Set<string>()
  const seenPairs = new Set<string>()
  for (const route of routes) {
    if (seenIds.has(route.id)) failures.push(`DUPLICATE_ROUTE_ID:${route.id}`)
    seenIds.add(route.id)
    const pair = `${route.hookType}:${route.narrativeDevice}`
    if (seenPairs.has(pair)) failures.push(`DUPLICATE_HOOK_DEVICE:${pair}`)
    seenPairs.add(pair)
  }
  return { valid: failures.length === 0, failures }
}

export interface CreativeContract {
  readonly profile: ProfileName
  readonly routes: readonly CreativeRoute[]
  readonly championRouteId: string
  readonly championScore: number
  readonly rejectedRoutes: readonly { readonly routeId: string; readonly reason: string }[]
  readonly packaging: z.infer<typeof PackagingContractSchema>
  readonly canonicalHash: ReturnType<typeof canonicalHash>
}

export function sealCreativeContract(input: unknown): CreativeContract {
  const parsed = CreativeContractInputSchema.parse(input)
  const failures = [...lintRouteDiversity(parsed.routes, parsed.profile).failures]
  const routeIds = new Set(parsed.routes.map((route) => route.id))
  if (!routeIds.has(parsed.championRouteId)) failures.push('CHAMPION_ROUTE_NOT_FOUND')
  if (parsed.championScore < thresholds.CREATIVE.CHAMPION_MIN_SCORE) {
    failures.push(`CHAMPION_BELOW_FLOOR:${parsed.championScore}`)
  }
  const rejectedIds = new Set(parsed.rejectedRoutes.map((route) => route.routeId))
  for (const route of parsed.routes) {
    if (route.id !== parsed.championRouteId && !rejectedIds.has(route.id)) {
      failures.push(`REJECTED_REASON_MISSING:${route.id}`)
    }
  }
  if (rejectedIds.has(parsed.championRouteId)) failures.push('CHAMPION_MARKED_REJECTED')
  if (failures.length > 0) throw new CreativeError('CREATIVE_CONTRACT_INVALID', failures)
  const payload = {
    profile: parsed.profile,
    routes: parsed.routes,
    championRouteId: parsed.championRouteId,
    championScore: parsed.championScore,
    rejectedRoutes: parsed.rejectedRoutes,
    packaging: parsed.packaging,
  }
  return { ...payload, canonicalHash: canonicalHash(payload) }
}
