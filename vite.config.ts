/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildDefines } from './vite.define.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: buildDefines,
  // The demo site; the library build is vite.lib.config.ts. Relative base: the demo is served from a sub-path
  // (GitHub Pages project site) and routes with the hash, so every asset URL stays relative.
  base: './',
  build: { outDir: 'dist-demo' },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // Whole-page renders of the 11-voter case evaluate every HP variant over 11 binary
    // voters and take several seconds each on a loaded machine.
    testTimeout: Number(process.env.ATLAS_TEST_TIMEOUT_MS ?? 30_000),
  },
})
