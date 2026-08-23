import { Linter } from 'eslint'
import guardrails from './eslint-rules/index.mjs'

const cases = [
  {
    name: 'G1', rule: 'g1-no-json-stringify-hash',
    filename: 'packages/core-hash/src/violation.js',
    code: 'hash(JSON.stringify({ b: 2, a: 1 }))', expected: 'nonCanonicalHash'
  },
  {
    name: 'G2', rule: 'g2-provider-sdk-boundary',
    filename: 'packages/creative/src/violation.js',
    code: "import OpenAI from 'openai'", expected: 'sdkBoundary'
  },
  {
    name: 'G6', rule: 'g6-no-provider-in-preflight',
    filename: 'packages/stage-runner/src/violation.js',
    code: 'class Runner { async preflight() { return provider.dispatch({}) } }', expected: 'providerCall'
  },
  {
    name: 'G9', rule: 'g9-guarded-dispatch-only',
    filename: 'packages/creative/src/violation.js',
    code: 'provider.dispatch(request, key)', expected: 'directDispatch'
  },
  {
    name: 'G9-computed', rule: 'g9-guarded-dispatch-only',
    filename: 'packages/creative/src/computed-violation.js',
    code: "provider['dispatch'](request, key)", expected: 'directDispatch'
  }
]

for (const testCase of cases) {
  const linter = new Linter()
  const messages = linter.verify(testCase.code, {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { range: true } },
    plugins: { 'factory-guardrails': guardrails },
    rules: { [`factory-guardrails/${testCase.rule}`]: 'error' }
  }, { filename: testCase.filename })
  if (!messages.some((message) => message.messageId === testCase.expected)) {
    throw new Error(`${testCase.name} did not catch its adversarial fixture`)
  }
}

console.log('G1, G2, G6 and G9 adversarial fixtures were rejected as required.')
