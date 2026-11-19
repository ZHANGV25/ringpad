import { defineConfig } from 'vitest/config'

// Unit tests cover the copy and the pure helpers; the components are covered end to end (e2e/).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/content/**/*.ts', 'src/components/cn.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
