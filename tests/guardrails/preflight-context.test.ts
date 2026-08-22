import { describe, expectTypeOf, it } from 'vitest'
import type { PreflightContext } from '../../packages/contracts/src/index.js'

describe('G6 PreflightContext boundary', () => {
  it('does not expose provider clients', () => {
    expectTypeOf<PreflightContext>().not.toHaveProperty('provider')
    expectTypeOf<PreflightContext>().not.toHaveProperty('providerClient')
    expectTypeOf<PreflightContext>().not.toHaveProperty('llm')
  })
})
