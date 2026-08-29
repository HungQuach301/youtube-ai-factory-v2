import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const resolver = await readFile('packages/assurance/src/bootstrap.ts', 'utf8')
const marker = JSON.parse(await readFile('qualification-runs/g02i-track-g-bootstrap.json', 'utf8'))
const workflow = await readFile('.github/workflows/g02i-track-g-bootstrap.yml', 'utf8')

describe('G-02I-1B Track G bootstrap guardrail', () => {
  it('opens only the qualification warning lane', () => {
    expect(resolver).toContain("result.mode === 'WARNING_ONLY'")
    expect(resolver).toContain('result.providerCallCount === 0')
    expect(resolver).toContain('releaseEligible: false')
    expect(marker).toMatchObject({ profile: 'REDUCED', assuranceMode: 'WARNING_ONLY', productionEligible: false })
  })

  it('keeps unknown gaps and Production hard-gate failures blocked', () => {
    expect(resolver).toContain("result.mode === 'HARD_GATE'")
    expect(resolver).toContain("'M2_HARD_GATE_NOT_PASSED'")
    expect(resolver).toContain("'M2_WARNING_RESULT_UNSAFE'")
  })

  it('is zero-provider and secret-free', () => {
    expect(workflow).not.toMatch(/secrets\.|API_KEY/u)
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('actions: read')
    expect(workflow).toContain('contents: read')
  })
})
