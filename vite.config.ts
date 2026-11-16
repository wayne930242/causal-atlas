/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildDefines } from './vite.define.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: buildDefines,
  // The demo site; the library build is vite.lib.config.ts.
  build: { outDir: 'dist-demo' },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
