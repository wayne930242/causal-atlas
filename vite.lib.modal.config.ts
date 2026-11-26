import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildDefines } from './vite.define.ts'

// `logic-atlas/modal`, built on its own after vite.lib.config.ts, into the same dist/ (not emptied).
// A separate build keeps the causal entries' chunks exactly as they were: shared source modules (Tex,
// label placement, arrows, segmented control, the locale hooks) are tree-shaken into modal.js instead of
// being split into chunks both sides would load. Its own styles go to dist/modal.css.
export default defineConfig({
  plugins: [react()],
  define: buildDefines,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: { modal: 'src/modal/index.ts' },
      formats: ['es'],
      cssFileName: 'modal',
    },
    rolldownOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^zod(\/.*)?$/, /^katex(\/.*)?$/],
      output: { chunkFileNames: 'modal-chunks/[name]-[hash].js' },
    },
  },
})
