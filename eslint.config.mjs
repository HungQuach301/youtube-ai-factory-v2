import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import factoryGuardrails from './tools/eslint-rules/index.mjs'

export default [
  { ignores: ['node_modules/**', '**/dist/**', 'coverage/**', 'tests/guardrails/fixtures/**'] },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint, 'factory-guardrails': factoryGuardrails },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'factory-guardrails/g1-no-json-stringify-hash': 'error',
      'factory-guardrails/g2-provider-sdk-boundary': 'error',
      'factory-guardrails/g6-no-provider-in-preflight': 'error'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' }
  }
]
