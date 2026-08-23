import { Linter } from 'eslint'
import { describe, expect, it } from 'vitest'
import guardrails from '../../tools/eslint-rules/index.mjs'

const baseConfig: Linter.Config = {
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { range: true } },
  plugins: { 'factory-guardrails': guardrails }
}

function verify(code: string, rule: string, filename: string): Linter.LintMessage[] {
  return new Linter().verify(
    code,
    { ...baseConfig, rules: { [`factory-guardrails/${rule}`]: 'error' } },
    { filename }
  )
}

describe('mandatory ESLint guardrails', () => {
  it('G1 rejects JSON.stringify passed to a hash function', () => {
    const messages = verify("hash(JSON.stringify({ b: 2, a: 1 }))", 'g1-no-json-stringify-hash', 'packages/core-hash/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('nonCanonicalHash')
  })

  it('G1 accepts canonicalHash on the original value', () => {
    expect(verify("canonicalHash({ b: 2, a: 1 })", 'g1-no-json-stringify-hash', 'packages/core-hash/src/valid.js')).toHaveLength(0)
  })

  it('G2 rejects provider SDK imports outside adapters', () => {
    const messages = verify("import OpenAI from 'openai'", 'g2-provider-sdk-boundary', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('sdkBoundary')
  })

  it('G2 permits provider SDK imports inside adapters', () => {
    expect(verify("import OpenAI from 'openai'", 'g2-provider-sdk-boundary', 'packages/provider/adapters/openai.js')).toHaveLength(0)
  })

  it('G6 rejects provider calls inside preflight()', () => {
    const messages = verify('class Runner { async preflight() { return provider.dispatch({}) } }', 'g6-no-provider-in-preflight', 'packages/stage-runner/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('providerCall')
  })

  it('G6 permits deterministic measurements inside preflight()', () => {
    expect(verify('class Runner { async preflight() { return measurements.verify() } }', 'g6-no-provider-in-preflight', 'packages/stage-runner/src/valid.js')).toHaveLength(0)
  })

  it('G6 rejects guardedDispatch inside preflight()', () => {
    const messages = verify('class Runner { async preflight() { return guardedDispatch(adapter, request) } }', 'g6-no-provider-in-preflight', 'packages/stage-runner/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('providerCall')
  })

  it('G6 rejects taking a provider method reference inside preflight()', () => {
    const messages = verify('class Runner { async preflight() { const call = provider.dispatch; return call({}) } }', 'g6-no-provider-in-preflight', 'packages/stage-runner/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('providerCall')
  })

  it('G9 rejects direct provider dispatch outside the framework', () => {
    const messages = verify('provider.dispatch(request, key)', 'g9-guarded-dispatch-only', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('directDispatch')
  })

  it('G9 rejects computed raw dispatch access outside the framework', () => {
    const messages = verify("provider['dispatch'](request, key)", 'g9-guarded-dispatch-only', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('directDispatch')
  })

  it('G9 rejects taking a raw dispatch method reference outside the framework', () => {
    const messages = verify('const send = provider.dispatch', 'g9-guarded-dispatch-only', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('directDispatch')
  })

  it('G9 rejects destructuring raw dispatch outside the framework', () => {
    const messages = verify('const { dispatch } = provider', 'g9-guarded-dispatch-only', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('directDispatch')
  })

  it('G9 rejects importing a concrete adapter outside the provider package', () => {
    const messages = verify("import adapter from '@youtube-ai-factory/provider/adapters/openai'", 'g9-guarded-dispatch-only', 'packages/creative/src/violation.js')
    expect(messages.map((message) => message.messageId)).toContain('adapterImport')
  })

  it('G9 rejects a named dispatch export from an adapter', () => {
    const messages = verify('export async function dispatch() {}', 'g9-guarded-dispatch-only', 'packages/provider/adapters/openai.js')
    expect(messages.map((message) => message.messageId)).toContain('dispatchExport')
  })

  it('G9 permits the single framework call site', () => {
    expect(verify('adapter.dispatch(request, key)', 'g9-guarded-dispatch-only', 'packages/provider/src/framework.js')).toHaveLength(0)
  })
})
