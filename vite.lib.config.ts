import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildDefines } from './vite.define.ts'

// Library build: ESM entries for components, engine and data, plus one CSS file.
// Declarations come from `tsc -p tsconfig.lib.json`.
export default defineConfig({
  plugins: [react()],
  define: buildDefines,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/components/index.ts',
        engine: 'src/engine/index.ts',
        data: 'src/data/index.ts',
      },
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^zod(\/.*)?$/, /^katex(\/.*)?$/],
    },
  },
})
