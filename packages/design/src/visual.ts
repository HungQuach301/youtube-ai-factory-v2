import { canonicalHash } from '@youtube-ai-factory/core-hash'
import { z } from 'zod'

import { DesignError } from './errors.js'
import { MotionClassSchema, VisualArchetypeSchema, VisualRouteSchema, type MotionClass, type VisualRoute } from './types.js'

const RoutingInputSchema = z.object({
  claimKind: z.enum(['FACT', 'ESTIMATE', 'MECHANISM', 'PROCESS', 'INTERPRETATION', 'PREDICTION']),
  observableReferent: z.boolean(),
  requiresObservableEvidence: z.boolean(),
  requiresAuthoredExplanation: z.boolean(),
}).strict()

export function routeVisual(input: unknown): VisualRoute {
  const parsed = RoutingInputSchema.parse(input)
  if ((parsed.claimKind === 'MECHANISM' || parsed.claimKind === 'PROCESS') && !parsed.observableReferent) return 'MAKE'
  if (parsed.requiresObservableEvidence && parsed.requiresAuthoredExplanation) return 'HYBRID'
  if (parsed.observableReferent || parsed.requiresObservableEvidence) return 'SOURCE'
  return 'MAKE'
}

const MotionInputSchema = z.object({
  authoredLayerStateChange: z.boolean(),
  sourceLocalSemanticMotion: z.boolean(),
  globalCameraMotion: z.boolean(),
}).strict()

export function classifyMotion(input: unknown): MotionClass {
  const parsed = MotionInputSchema.parse(input)
  if (parsed.authoredLayerStateChange) return 'LAYERED_SEMANTIC'
  if (parsed.sourceLocalSemanticMotion) return 'SOURCE_SEMANTIC'
  return 'CAMERA_ONLY'
}

const VisualShotSchema = z.object({
  shotId: z.string().min(1),
  route: VisualRouteSchema,
  motionClass: MotionClassSchema,
  archetype: VisualArchetypeSchema,
}).strict()

const VisualGrammarInputSchema = z.object({
  identityHash: z.string().regex(/^[0-9a-f]{64}$/u),
  shots: z.array(VisualShotSchema).min(1),
}).strict()

export function sealVisualGrammar(input: unknown) {
  const parsed = VisualGrammarInputSchema.parse(input)
  const ids = new Set<string>()
  const failures: string[] = []
  for (const shot of parsed.shots) {
    if (ids.has(shot.shotId)) failures.push(`DUPLICATE_SHOT_ID:${shot.shotId}`)
    ids.add(shot.shotId)
  }
  if (failures.length > 0) throw new DesignError('VISUAL_GRAMMAR_INVALID', failures)
  return { ...parsed, visualGrammarHash: canonicalHash(parsed) }
}

export function assertRouteFrozen(plannedRoute: VisualRoute, requestedRoute: VisualRoute): void {
  if (plannedRoute !== requestedRoute) throw new DesignError('ROUTE_FROZEN', [`ROUTE_CHANGE_DENIED:${plannedRoute}:${requestedRoute}`])
}
