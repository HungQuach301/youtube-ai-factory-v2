import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Stage 12 feasibility-search static guardrails', () => {
  it('keeps canonical and Sites typed mirrors shadow-only', () => {
    const canonical = read('packages/contracts/src/stage12-lra-feasibility.ts')
    const mirror = read('sites/control-plane/app/stage12-lra-feasibility-contract.ts')
    expect(canonical).toMatch(/RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH/u)
    expect(canonical).toMatch(/uploadCorrectedOutput: false/u)
    expect(canonical).toMatch(/providerCallCount: 0/u)
    expect(canonical).toMatch(/productionActivation: false/u)
    expect(mirror).toMatch(/packages\/contracts\/src\/stage12-lra-feasibility/u)
  })

  it('contains no attempt/ordinal 4 or Production invocation path', () => {
    const scope = [read('packages/media-worker/stage12-lra-feasibility-controller.mjs'),
      read('packages/contracts/src/stage12-lra-feasibility.ts'),
      read('sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql')]
      .join('\n')
    expect(scope).not.toMatch(/attempt(?:Ordinal)?\s*[:=_ ]\s*4/iu)
    expect(scope).not.toMatch(/correction(?:Ordinal)?\s*[:=_ ]\s*4/iu)
    expect(scope).not.toMatch(/dispatchStage12|authenticatedFetch|writeFile|r2Key/iu)
  })

  it('does not change acceptance thresholds', () => {
    const root = read('packages/contracts/src/thresholds.ts')
    const sites = read('sites/control-plane/packages/contracts/src/thresholds.ts')
    expect(root).toBe(sites)
    expect(root).toMatch(/target: -14, tolerance: 1/u)
    expect(root).toMatch(/TRUE_PEAK_MAX_DBTP: -1/u)
    expect(root).toMatch(/LRA: \{ min: 4, max: 8 \}/u)
  })
})
