/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tauri expects a fixed dev port and needs to see Rust errors in the terminal.
const DEV_PORT = 1420

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    // Test reports are not the app: a coverage run writing its HTML would reload every open page,
    // including the ones an e2e run is driving.
    watch: { ignored: ['**/coverage/**', '**/test-results/**', '**/playwright-report/**'] },
  },
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'jsdom',
    // Unit tests live next to the code; e2e/ holds the Playwright suite (playwright.config.ts).
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/test/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
