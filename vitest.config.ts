import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'],
    passWithNoTests: false,
    coverage: { enabled: false },
  },
})
