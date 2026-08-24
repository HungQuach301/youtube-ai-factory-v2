import type { ProfileName } from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import { MediaSpecError } from './errors.js'

export type CompositionMotion = 'PAN_ZOOM' | 'FADE_WIPE' | 'TIMED_OVERLAY' | 'PATH_CHART_MORPH' | 'COMPLEX_FALLBACK'
export type CompositionEngine = 'RENDER_ONCE_FFMPEG' | 'HEADLESS_CHROMIUM' | 'RENDER_PER_FRAME'

export interface CompositionUnit {
  readonly id: string
  readonly critical: boolean
  readonly motions: readonly CompositionMotion[]
  readonly variantCount: number
}

export interface CompositionPlanItem {
  readonly unitId: string
  readonly engine: CompositionEngine
  readonly renderPixelPasses: number
  readonly filterGraph: readonly string[]
}

export interface CompositionPlan {
  readonly profile: ProfileName
  readonly items: readonly CompositionPlanItem[]
  readonly renderPerFrameCount: number
}

function engineFor(motions: readonly CompositionMotion[]): CompositionEngine {
  if (motions.includes('COMPLEX_FALLBACK')) return 'RENDER_PER_FRAME'
  if (motions.includes('PATH_CHART_MORPH')) return 'HEADLESS_CHROMIUM'
  return 'RENDER_ONCE_FFMPEG'
}

export function planCompositions(profile: ProfileName, units: readonly CompositionUnit[]): CompositionPlan {
  const failures: string[] = []
  const requiredCriticalVariants = thresholds.PROFILE[profile].compositionsPerCriticalUnit
  const items = units.map((unit): CompositionPlanItem => {
    if (unit.critical && unit.variantCount < requiredCriticalVariants) failures.push('CRITICAL_VARIANT_SHORTFALL:' + unit.id)
    if (unit.variantCount <= 0) failures.push('VARIANT_COUNT_INVALID:' + unit.id)
    const engine = engineFor(unit.motions)
    return {
      unitId: unit.id,
      engine,
      renderPixelPasses: engine === 'RENDER_ONCE_FFMPEG' ? 1 : engine === 'HEADLESS_CHROMIUM' ? 1 : 30,
      filterGraph: unit.motions.filter((motion) => motion !== 'PATH_CHART_MORPH' && motion !== 'COMPLEX_FALLBACK'),
    }
  })
  if (failures.length > 0) throw new MediaSpecError('COMPOSITION_PLAN_INVALID', failures)
  return { profile, items, renderPerFrameCount: items.filter((item) => item.engine === 'RENDER_PER_FRAME').length }
}
