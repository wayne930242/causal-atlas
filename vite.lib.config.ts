import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { buildDefines } from './vite.define.ts'

/** A case file's module id. */
const CASE_FILE = /[/\\]src[/\\]data[/\\]cases[/\\][^/\\]+\.json/

/** Component entries: `causal-atlas/<name>` → `dist/<name>.js`, each pulling only its own code. */
const COMPONENT_ENTRIES = ['playground', 'probability', 'identify', 'lanes', 'extension', 'case', 'editor', 'cite', 'supplement', 'i18n']

/**
 * The case store imports `./case-preload.ts` (every case, for the demo and tests). In the library that
 * import becomes the package's own `#case-preload`, which package.json `imports` maps to every case under
 * Node (server renders draw at once) and to nothing elsewhere (browsers load one case at a time).
 */
function casePreloadImport(): Plugin {
  return {
    name: 'causal-atlas:case-preload',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './case-preload.ts' && importer !== undefined && /[/\\]src[/\\]data[/\\]case-store\.ts$/.test(importer)) {
        return { id: '#case-preload', external: true }
      }
      return null
    },
  }
}

// Library build: ESM entries for components, engine and data, plus one CSS file.
// Declarations come from `tsc -p tsconfig.lib.json`.
export default defineConfig({
  plugins: [casePreloadImport(), react()],
  define: buildDefines,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: {
        index: 'src/components/index.ts',
        ...Object.fromEntries(COMPONENT_ENTRIES.map((name) => [name, `src/components/entries/${name}.ts`])),
        engine: 'src/engine/index.ts',
        data: 'src/data/index.ts',
        'case-preload.node': 'src/data/case-preload.ts',
        'case-preload.browser': 'src/data/case-preload-browser.ts',
      },
      formats: ['es'],
      cssFileName: 'style',
    },
    rolldownOptions: {
      external: [/^react(\/.*)?$/, /^react-dom(\/.*)?$/, /^zod(\/.*)?$/, /^katex(\/.*)?$/],
      output: {
        // Shared code and the lazy chunks (one per case, the image export) live under chunks/.
        chunkFileNames: (chunk) => (chunk.moduleIds.length > 0 && chunk.moduleIds.every((id) => CASE_FILE.test(id)) ? 'cases/[name]-[hash].js' : 'chunks/[name]-[hash].js'),
      },
    },
  },
})
